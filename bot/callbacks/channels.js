// bot/callbacks/channels.js

const User = require('../../models/User');
const Channel = require('../../models/Channel');
const { processNews, processSingleChannel } = require('../../services/postService');

// Клавіатури (ОДИН РАЗ)
const { cancelMenu } = require('../keyboards/main');
const {
    getChannelSettingsKeyboard,
    getIntervalKeyboard,
    getScheduleKeyboard
} = require('../keyboards/channel');

// Рендерери
const { renderSourcesList, renderPromptSettings, renderChannelSettings } = require('./ui_renderers');

const channelHandler = async (bot, query, user, callbacks) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;

    try {
        if (data.startsWith('add_tgsrc_')) {
            // Витягуємо ID каналу (проекту) з callback_data
            const channelId = data.split('_')[2];

            // 1. Оновлюємо стан користувача в базі
            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                {
                    tempState: 'WAITING_TG_SOURCE',
                    tempData: {
                        targetChannelId: channelId,
                        // Зберігаємо ID поточного повідомлення, щоб потім його відредагувати
                        instructionMessageId: messageId
                    }
                }
            );

            // 2. Формуємо текст інструкції
            const originalText =
                "📱 <b>Додавання Telegram-джерела</b>\n\n" +
                "Надішліть посилання на канал, за яким треба стежити.\n\n" +
                "Приклади:\n" +
                "• <code>https://t.me/username</code>\n" +
                "• <code>@username</code>\n\n" +
                "<i>Бот буде автоматично робити рерайт нових постів з цього каналу.</i>";

            // 3. Редагуємо існуюче меню, перетворюючи його на інструкцію
            return bot.editMessageText(originalText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                // Додаємо кнопку скасування, щоб повернутися назад, якщо юзер передумав
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌ Скасувати', callback_data: `sources_list_${channelId}` }]
                    ]
                }
            });
        }

        // --- СПИСОК КАНАЛІВ ---
        if (data === 'list_channels') {
            const channels = await Channel.find({ userId: user._id });
            if (channels.length === 0) {
                return bot.editMessageText("📊 <b>Список порожній.</b>", {
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
                text: `📺 ${ch.channelUsername || "Без назви"} (/${ch.checkInterval}хв)`,
                callback_data: `manage_${ch._id}`
            }]));
            keyboard.push([{ text: '🚀 Перевірити всі зараз', callback_data: 'force_check_all' }]);
            keyboard.push([{ text: '⬅️ Назад', callback_data: 'main_menu' }]);

            return bot.editMessageText("📊 <b>Ваші канали:</b>", {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard }
            });
        }

        // --- ГОЛОВНЕ МЕНЮ КАНАЛУ (MANAGE) ---
        if (data.startsWith('manage_') || data.startsWith('menu_settings_')) {
            const channelId = data.includes('manage_') ? data.split('_')[1] : data.split('_')[2];
            const channel = await Channel.findById(channelId);
            if (!channel) return bot.answerCallbackQuery(query.id, { text: "❌ Канал не знайдено" });

            // Викликаємо наш новий багатий рендерер
            return renderChannelSettings(bot, chatId, messageId, channel, user);
        }

        // --- КЕРУВАННЯ ДЖЕРЕЛАМИ (SOURCES) ---
        if (data.startsWith('sources_list_')) {
            return renderSourcesList(bot, chatId, messageId, data.slice(13));
        }

        if (data.startsWith('remove_tgsrc_')) {
            const parts = data.split('_');
            // parts[0] = "remove", parts[1] = "tgsrc", parts[2] = chId, parts[3] = index
            const chId = parts[2];
            const index = parseInt(parts[3]);

            const ch = await Channel.findById(chId);

            if (ch && ch.tgSources && ch.tgSources[index] !== undefined) {
                // Видаляємо елемент за індексом
                ch.tgSources.splice(index, 1);

                await ch.save();
                await bot.answerCallbackQuery(query.id, { text: "Джерело видалено" });

                // Оновлюємо список у чаті
                return renderSourcesList(bot, chatId, messageId, chId);
            } else {
                await bot.answerCallbackQuery(query.id, { text: "Помилка: джерело не знайдено", show_alert: true });
            }
        }

        // --- ІНТЕРВАЛИ ПЕРЕВІРКИ ---
        // bot/callbacks/channels.js

        if (data.startsWith('edit_interval_')) {
            const chId = data.replace('edit_interval_', '');
            const ch = await Channel.findById(chId); // Знаходимо канал, щоб передати об'єкт

            if (!ch) return bot.answerCallbackQuery(query.id, { text: "❌ Проєкт не знайдено" });

            return bot.editMessageText("⏱ <b>Змінити інтервал</b>\nОберіть режим або введіть час:", {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: getIntervalKeyboard(ch) } // Передаємо об'єкт ch
            });
        }

        if (data.startsWith('set_int_')) {
            const [, , chId, minutes] = data.split('_');
            const updatedChannel = await Channel.findByIdAndUpdate(
                chId,
                { checkInterval: parseInt(minutes) },
                { new: true }
            );
            return renderChannelSettings(bot, chatId, messageId, updatedChannel, user);
        }

        // --- ПЕРЕВІРКА ТА СТАТУС ---
        if (data.startsWith('check_one_')) {
            const chId = data.slice(10);
            const ch = await Channel.findById(chId).populate('userId');

            if (!ch) return bot.answerCallbackQuery(query.id, { text: "❌ Канал не знайдено" });

            // Повідомляємо, що процес пішов
            await bot.answerCallbackQuery(query.id, { text: "⏳ Перевірка запущена..." });

            // Запускаємо логіку перевірки
            await processSingleChannel(bot, ch);

            const updatedCh = await Channel.findById(chId);

            // Оновлюємо основне меню (щоб змінився час останньої перевірки)
            await renderChannelSettings(bot, chatId, messageId, updatedCh, user);

            // ЗАМІСТЬ sendMessage використовуємо повторний answerCallbackQuery (якщо це дозволяє затримка)
            // Або просто нічого не шлемо, бо статус оновиться в самому меню.
            // Але якщо хочеш саме "плашку" в кінці, найкраще зробити так:
            return bot.answerCallbackQuery(query.id, {
                text: `✅ Перевірка "${updatedCh.channelUsername}" завершена!`,
                show_alert: false
            }).catch(() => {
                // Якщо минуло багато часу і answerCallbackQuery вже не діє, 
                // бот просто проігнорує цей крок без помилки в консолі
            });
        }

        if (data === 'force_check_all') {
            await bot.answerCallbackQuery(query.id, { text: "🚀 Запуск загальної перевірки" });
            await processNews(bot, user._id);
        }

        // --- AI ПРОМПТИ ---
        if (data.startsWith('edit_prompt_')) {
            const chId = data.replace('edit_prompt_', '');
            const plan = user.subscription?.plan || 'free';
            const canEdit = user.role === 'admin' || user.subscription?.hasCustomPrompt || plan !== 'free';

            if (!canEdit) {
                return bot.editMessageText(`⚠️ <b>AI Промпти недоступні</b>\n\nНа тарифі FREE діє стандартний алгоритм.`, {
                    chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🚀 Оновити тариф', callback_data: 'subscription_shop' }],
                            [{ text: '🔙 Назад', callback_data: `manage_${chId}` }]
                        ]
                    }
                });
            }
            return renderPromptSettings(bot, chatId, messageId, chId);
        }

        // --- ВИДАЛЕННЯ КАНАЛУ ---
        if (data.startsWith('del_')) {
            const chId = data.slice(4);
            return bot.editMessageText(`⚠️ <b>Підтвердження видалення</b>\n\nВсі дані будуть втрачені.`, {
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
            await bot.answerCallbackQuery(query.id, { text: "✅ Видалено" });
            return callbacks.sendMainMenu(chatId, messageId);
        }
        // bot/callbacks/channels.js (або інший файл обробки юзерів)
        if (data.startsWith('user_ch_toggle_')) {
            const channelId = data.replace('user_ch_toggle_', '');
            const userId = user._id;

            try {
                const channel = await Channel.findById(channelId);
                if (!channel) return bot.answerCallbackQuery(query.id, { text: "❌ Проєкт не знайдено" });

                if (channel.userId.toString() !== userId.toString() && user.role !== 'admin') {
                    return bot.answerCallbackQuery(query.id, { text: "⛔ Це не ваш проєкт!" });
                }

                // Змінюємо статус
                channel.isActive = !channel.isActive;

                // Якщо ми ВМИКАЄМО канал, скидаємо ID останніх постів у 0.
                // Це змусить парсер зробити "ініціалізацію" (запам'ятати поточний останній пост і чекати на наступний).
                if (channel.isActive && channel.tgSources && channel.tgSources.length > 0) {
                    channel.tgSources = channel.tgSources.map(src => ({
                        ...src,
                        lastMessageId: 0
                    }));
                }

                await channel.save();

                await bot.answerCallbackQuery(query.id, {
                    text: channel.isActive ? "🚀 Працюю (чекаю на нові пости)" : "⏸ Призупинено"
                });

                return renderChannelSettings(bot, chatId, messageId, channel, user);

            } catch (e) {
                console.error("🔴 Toggle Error:", e.message);
            }
        }
        if (data === 'locked_feature_ai') {
            return bot.answerCallbackQuery(query.id, {
                text: "🔒 Ця функція доступна лише у платному тарифі.\n\nБудь ласка, оновіть підписку в головному меню, щоб налаштовувати власні AI промпти!",
                show_alert: true // Це покаже повноцінне вікно з кнопкою "OK", а не просто плашку
            });
        }

        // --- РЕДАГУВАННЯ AI ПРОМПТУ (ЛОГІКА КНОПОК) ---

        // 1. Натискання на "✏️ Змінити промпт"
        if (data.startsWith('start_edit_prompt_')) {
            const channelId = data.replace('start_edit_prompt_', '');
            const ch = await Channel.findById(channelId);
            if (!ch) return;

            // Встановлюємо стан очікування тексту від юзера
            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                {
                    tempState: 'EDIT_PROMPT',
                    'tempData.editingChannelId': channelId,
                    'tempData.menuMessageId': messageId // ЗАПАМ'ЯТОВУЄМО ЦЕ ПОВІДОМЛЕННЯ
                }
            );

            const text = `📝 <b>Редагування промпту</b>\n\n` +
                `Канал: <b>${ch.channelUsername}</b>\n\n` +
                `Будь ласка, <b>напишіть та відправте</b> новий текст промпту у цей чат.\n\n` +
                `<i>Підказка: Опишіть, у якому стилі AI має робити рерайт (наприклад: "пиши професійно", "використовуй молодіжний сленг" тощо).</i>`;

            return await bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌ Скасувати', callback_data: `edit_prompt_${channelId}` }]
                    ]
                }
            });
        }

        // 2. Натискання на "🔄 Скинути до стандартного"
        if (data.startsWith('reset_prompt_')) {
            const chId = data.slice(13);

            // 1. Скидаємо в базі
            await Channel.findByIdAndUpdate(chId, { aiPrompt: null });

            // 2. Відповідаємо Telegram (плашка зверху)
            await bot.answerCallbackQuery(query.id, { text: "✅ Промпт скинуто до стандартного" });

            // 3. Перемальовуємо вікно промпту (викликаємо наш новий рендерер)
            // Тут messageId — це те саме повідомлення, на якому натиснули кнопку
            return renderPromptSettings(bot, chatId, messageId, chId);
        }
        // Відкрити розклад (годинник)
        if (data.startsWith('open_schedule_')) {
            const chId = data.split('_')[2];
            const ch = await Channel.findById(chId);

            if (!ch) return bot.answerCallbackQuery(query.id, { text: "❌ Канал не знайдено" });

            return bot.editMessageText(
                "📅 <b>Розклад публікацій</b>\nОберіть години, в які бот повинен робити перевірку. Бот заходитиме один раз протягом кожної обраної години.",
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: getScheduleKeyboard(ch) // Виклик функції
                }
            );
        }

        // Перемикання години в розкладі
        if (data.startsWith('toggle_hour_')) {
            const [, , chId, hourStr] = data.split('_');
            const hour = parseInt(hourStr);
            const ch = await Channel.findById(chId);

            let schedule = ch.dailySchedule || [];
            if (schedule.includes(hour)) {
                schedule = schedule.filter(h => h !== hour);
            } else {
                schedule.push(hour);
                schedule.sort((a, b) => a - b);
            }

            ch.dailySchedule = schedule;
            ch.scheduleMode = 'daily';
            await ch.save();

            return bot.editMessageReplyMarkup(getScheduleKeyboard(ch), { chat_id: chatId, message_id: messageId });
        }

        // Перемикання назад на інтервальний режим
        if (data.startsWith('set_mode_interval_')) {
            const chId = data.split('_')[3];
            await Channel.findByIdAndUpdate(chId, { scheduleMode: 'interval' });
            await bot.answerCallbackQuery(query.id, { text: "🔄 Увімкнено режим інтервалів" });
            const ch = await Channel.findById(chId);
            return bot.editMessageText("⏱ <b>Налаштування інтервалу</b>\nОберіть, як часто перевіряти джерела:", {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: { inline_keyboard: getIntervalKeyboard(ch) }
            });
        }

        // Ручне введення інтервалу
        if (data.startsWith('manual_int_')) {
            const chId = data.split('_')[2];

            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                {
                    tempState: 'WAITING_MANUAL_INTERVAL',
                    tempData: {
                        targetChannelId: chId,
                        // Додаємо цей рядок, щоб бот знав, яке повідомлення редагувати пізніше
                        instructionMessageId: messageId
                    }
                }
            );

            // Замість sendMessage використовуємо editMessageText
            return bot.editMessageText("⌨️ <b>Введіть інтервал у хвилинах</b> (наприклад, 45 або 120):", {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Скасувати', callback_data: `edit_interval_${chId}` }]]
                }
            });
        }
    } catch (error) {
        console.error("❌ Channels Handler Error:", error);
    }
};

// ПРАВИЛЬНО:
module.exports = channelHandler;