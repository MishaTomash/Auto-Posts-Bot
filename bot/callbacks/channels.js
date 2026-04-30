// bot/callbacks/channels.js

const User = require('../../models/User');
const Channel = require('../../models/Channel');
const { processNews, processSingleChannel } = require('../../services/postService');

const { cancelMenu } = require('../keyboards/main');
const { getChannelSettingsKeyboard, getIntervalKeyboard, getScheduleKeyboard } = require('../keyboards/channel');
const { renderSourcesList, renderPromptSettings, renderChannelSettings } = require('./ui_renderers');

// ─── Перевірка активної підписки ─────────────────────────────────────────────
// Повертає true якщо тариф FREE або підписка ще діє
const hasActiveSubscription = (user) => {
    if (user.subscription.plan === 'free') return true;
    if (!user.subscription.expiresAt) return false;
    return new Date(user.subscription.expiresAt) > new Date();
};

// ─── Повідомлення про необхідність купити тариф ───────────────────────────────
const sendSubscriptionExpiredAlert = (bot, chatId, messageId) => {
    return bot.editMessageText(
        `🔒 <b>Підписка неактивна</b>\n\n` +
        `Щоб запустити проєкт, необхідна активна підписка.\n\n` +
        `Після придбання тарифу всі канали в межах ліміту увімкнуться автоматично.`,
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💎 Обрати тариф', callback_data: 'subscription_shop' }],
                    [{ text: '🏠 Меню', callback_data: 'main_menu' }]
                ]
            }
        }
    );
};

// ─────────────────────────────────────────────────────────────────────────────

const channelHandler = async (bot, query, user, callbacks) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;

    try {

        // --- ДОДАВАННЯ TG ДЖЕРЕЛА ---
        if (data.startsWith('add_tgsrc_')) {
            const channelId = data.split('_')[2];

            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                {
                    tempState: 'WAITING_TG_SOURCE',
                    tempData: { targetChannelId: channelId, instructionMessageId: messageId }
                }
            );

            return bot.editMessageText(
                `📱 <b>Додавання Telegram-джерела</b>\n\n` +
                `Надішліть посилання на канал:\n` +
                `• <code>https://t.me/username</code>\n` +
                `• <code>@username</code>`,
                {
                    chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[{ text: '❌ Скасувати', callback_data: `sources_list_${channelId}` }]]
                    }
                }
            );
        }

        // --- СПИСОК КАНАЛІВ ---
        if (data === 'list_channels') {
            const channels = await Channel.find({ userId: user._id });
            if (channels.length === 0) {
                return bot.editMessageText('📊 <b>Список порожній.</b>', {
                    chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '➕ Створити проект', callback_data: 'start_wizard' }],
                            [{ text: '🏠 Меню', callback_data: 'main_menu' }]
                        ]
                    }
                });
            }

            const keyboard = channels.map(ch => ([{
                text: `📺 ${ch.channelUsername || 'Без назви'} (/${ch.checkInterval}хв)`,
                callback_data: `manage_${ch._id}`
            }]));
            keyboard.push([{ text: '🚀 Перевірити всі зараз', callback_data: 'force_check_all' }]);
            keyboard.push([{ text: '⬅️ Назад', callback_data: 'main_menu' }]);

            return bot.editMessageText('📊 <b>Ваші канали:</b>', {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        }

        // --- МЕНЮ НАЛАШТУВАНЬ КАНАЛУ ---
        if (data.startsWith('manage_') || data.startsWith('menu_settings_')) {
            const channelId = data.includes('manage_') ? data.split('_')[1] : data.split('_')[2];
            const channel = await Channel.findById(channelId);
            if (!channel) return bot.answerCallbackQuery(query.id, { text: '❌ Канал не знайдено' });

            return renderChannelSettings(bot, chatId, messageId, channel, user);
        }

        // --- СПИСОК ДЖЕРЕЛ ---
        if (data.startsWith('sources_list_')) {
            return renderSourcesList(bot, chatId, messageId, data.slice(13));
        }

        if (data.startsWith('remove_tgsrc_')) {
            const parts = data.split('_');
            const chId = parts[2];
            const index = parseInt(parts[3]);
            const ch = await Channel.findById(chId);

            if (ch?.tgSources?.[index] !== undefined) {
                ch.tgSources.splice(index, 1);
                await ch.save();
                await bot.answerCallbackQuery(query.id, { text: 'Джерело видалено' });
                return renderSourcesList(bot, chatId, messageId, chId);
            }
            return bot.answerCallbackQuery(query.id, { text: 'Помилка: джерело не знайдено', show_alert: true });
        }

        // --- ІНТЕРВАЛИ ---
        if (data.startsWith('edit_interval_')) {
            const chId = data.replace('edit_interval_', '');
            const ch = await Channel.findById(chId);
            if (!ch) return bot.answerCallbackQuery(query.id, { text: '❌ Проєкт не знайдено' });

            return bot.editMessageText('⏱ <b>Змінити інтервал</b>\nОберіть режим або введіть час:', {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: { inline_keyboard: getIntervalKeyboard(ch) }
            });
        }

        if (data.startsWith('set_int_')) {
            const [, , chId, minutes] = data.split('_');
            const updatedChannel = await Channel.findByIdAndUpdate(
                chId, { checkInterval: parseInt(minutes) }, { new: true }
            );
            return renderChannelSettings(bot, chatId, messageId, updatedChannel, user);
        }

        // --- ПЕРЕВІРКА ОДНОГО КАНАЛУ ---
        if (data.startsWith('check_one_')) {
            const chId = data.slice(10);
            const ch = await Channel.findById(chId).populate('userId');
            if (!ch) return bot.answerCallbackQuery(query.id, { text: '❌ Канал не знайдено' });

            await bot.answerCallbackQuery(query.id, { text: '⏳ Перевірка запущена...' });
            await processSingleChannel(bot, ch);

            const updatedCh = await Channel.findById(chId);
            await renderChannelSettings(bot, chatId, messageId, updatedCh, user);

            return bot.answerCallbackQuery(query.id, {
                text: `✅ Перевірка "${updatedCh.channelUsername}" завершена!`,
                show_alert: false
            }).catch(() => { });
        }

        if (data === 'force_check_all') {
            await bot.answerCallbackQuery(query.id, { text: '🚀 Запуск загальної перевірки' });
            await processNews(bot, user._id);
        }

        // --- AI ПРОМПТИ ---
        if (data.startsWith('edit_prompt_')) {
            const chId = data.replace('edit_prompt_', '');
            const canEdit = user.role === 'admin' || user.subscription?.hasCustomPrompt;

            if (!canEdit) {
                return bot.editMessageText(
                    `⚠️ <b>AI Промпти недоступні</b>\n\nНа тарифі FREE діє стандартний алгоритм.`,
                    {
                        chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🚀 Оновити тариф', callback_data: 'subscription_shop' }],
                                [{ text: '🔙 Назад', callback_data: `manage_${chId}` }]
                            ]
                        }
                    }
                );
            }
            return renderPromptSettings(bot, chatId, messageId, chId);
        }

        // --- ВИДАЛЕННЯ КАНАЛУ ---
        if (data.startsWith('del_')) {
            const chId = data.slice(4);
            return bot.editMessageText('⚠️ <b>Підтвердження видалення</b>\n\nВсі дані будуть втрачені.', {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🗑 Так, видалити', callback_data: `confirm_del_${chId}` }],
                        [{ text: '⬅️ Скасувати', callback_data: `manage_${chId}` }]
                    ]
                }
            });
        }

        if (data.startsWith('confirm_del_')) {
            await Channel.findByIdAndDelete(data.slice(12));
            await bot.answerCallbackQuery(query.id, { text: '✅ Видалено' });
            return callbacks.sendMainMenu(chatId, messageId);
        }

        // ─── TOGGLE (ЗАПУСК / ПАУЗА) ─────────────────────────────────────────
        if (data.startsWith('user_ch_toggle_')) {
            const channelId = data.replace('user_ch_toggle_', '');
            const channel = await Channel.findById(channelId);

            if (!channel) return bot.answerCallbackQuery(query.id, { text: '❌ Проєкт не знайдено' });

            if (channel.userId.toString() !== user._id.toString() && user.role !== 'admin') {
                return bot.answerCallbackQuery(query.id, { text: '⛔ Це не ваш проєкт!' });
            }

            // Перевіряємо, чи користувач намагається УВІМКНУТИ проєкт
            const tryingToActivate = !channel.isActive;

            if (tryingToActivate) {
                // 1. Перевірка терміну підписки (якщо тариф не FREE)
                if (user.subscription.plan !== 'free') {
                    const isExpired = !user.subscription.expiresAt || new Date(user.subscription.expiresAt) < new Date();
                    if (isExpired) {
                        return sendSubscriptionExpiredAlert(bot, chatId, messageId);
                    }
                }

                // 2. ПЕРЕВІРКА ЛІМІТУ ТАРИФУ (Ваша логіка)
                const activeCount = await Channel.countDocuments({
                    userId: user._id,
                    isActive: true
                });

                if (activeCount >= user.subscription.maxChannels) {
                    // Виводимо повідомлення, як на фото (show_alert: true)
                    return bot.answerCallbackQuery(query.id, {
                        text: `🔒 У вас ліміт (${user.subscription.maxChannels} шт). Придбайте тариф для запуску більшої кількості проєктів!`,
                        show_alert: true
                    });
                }
            }

            // Якщо всі перевірки пройдені або користувач вимикає проєкт — змінюємо статус
            channel.isActive = !channel.isActive;

            // При увімкненні скидаємо lastMessageId, щоб бот почав зі свіжих постів
            if (channel.isActive && channel.tgSources?.length > 0) {
                channel.tgSources = channel.tgSources.map(src => ({
                    ...src.toObject(),
                    lastMessageId: 0
                }));
            }

            await channel.save();

            await bot.answerCallbackQuery(query.id, {
                text: channel.isActive ? '🚀 Проєкт запущено' : '⏸ Призупинено'
            });

            // Оновлюємо інтерфейс налаштувань
            return renderChannelSettings(bot, chatId, messageId, channel, user);
        }

        // --- LOCKED FEATURE AI ---
        if (data === 'locked_feature_ai') {
            return bot.answerCallbackQuery(query.id, {
                text: '🔒 Ця функція доступна лише у платному тарифі.',
                show_alert: true
            });
        }

        // --- РЕДАГУВАННЯ ПРОМПТУ ---
        if (data.startsWith('start_edit_prompt_')) {
            const channelId = data.replace('start_edit_prompt_', '');
            const ch = await Channel.findById(channelId);
            if (!ch) return;

            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                {
                    tempState: 'EDIT_PROMPT',
                    'tempData.editingChannelId': channelId,
                    'tempData.menuMessageId': messageId
                }
            );

            return bot.editMessageText(
                `📝 <b>Редагування промпту</b>\n\nКанал: <b>${ch.channelUsername}</b>\n\n` +
                `Будь ласка, <b>напишіть та відправте</b> новий текст промпту у цей чат.`,
                {
                    chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[{ text: '❌ Скасувати', callback_data: `edit_prompt_${channelId}` }]]
                    }
                }
            );
        }

        if (data.startsWith('reset_prompt_')) {
            const chId = data.slice(13);
            await Channel.findByIdAndUpdate(chId, { aiPrompt: null });
            await bot.answerCallbackQuery(query.id, { text: '✅ Промпт скинуто до стандартного' });
            return renderPromptSettings(bot, chatId, messageId, chId);
        }

        // --- РОЗКЛАД ---
        if (data.startsWith('open_schedule_')) {
            const chId = data.split('_')[2];
            const ch = await Channel.findById(chId);
            if (!ch) return bot.answerCallbackQuery(query.id, { text: '❌ Канал не знайдено' });

            return bot.editMessageText(
                '📅 <b>Розклад публікацій</b>\nОберіть години перевірки:',
                {
                    chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                    reply_markup: getScheduleKeyboard(ch)
                }
            );
        }

        if (data.startsWith('toggle_hour_')) {
            const [, , chId, hourStr] = data.split('_');
            const hour = parseInt(hourStr);
            const ch = await Channel.findById(chId);

            let schedule = ch.dailySchedule || [];
            schedule = schedule.includes(hour)
                ? schedule.filter(h => h !== hour)
                : [...schedule, hour].sort((a, b) => a - b);

            ch.dailySchedule = schedule;
            ch.scheduleMode = 'daily';
            await ch.save();

            return bot.editMessageReplyMarkup(getScheduleKeyboard(ch), { chat_id: chatId, message_id: messageId });
        }

        if (data.startsWith('set_mode_interval_')) {
            const chId = data.split('_')[3];
            await Channel.findByIdAndUpdate(chId, { scheduleMode: 'interval' });
            await bot.answerCallbackQuery(query.id, { text: '🔄 Увімкнено режим інтервалів' });
            const ch = await Channel.findById(chId);
            return bot.editMessageText('⏱ <b>Налаштування інтервалу</b>\nОберіть, як часто перевіряти джерела:', {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: { inline_keyboard: getIntervalKeyboard(ch) }
            });
        }

        if (data.startsWith('manual_int_')) {
            const chId = data.split('_')[2];
            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                {
                    tempState: 'WAITING_MANUAL_INTERVAL',
                    tempData: { targetChannelId: chId, instructionMessageId: messageId }
                }
            );

            return bot.editMessageText('⌨️ <b>Введіть інтервал у хвилинах</b> (наприклад, 45 або 120):', {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Скасувати', callback_data: `edit_interval_${chId}` }]]
                }
            });
        }

    } catch (error) {
        console.error('❌ Channels Handler Error:', error);
    }
};

module.exports = channelHandler;