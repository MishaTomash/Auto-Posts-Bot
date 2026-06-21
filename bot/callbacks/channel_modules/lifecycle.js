// bot/callbacks/channel_modules/lifecycle.js
// Запуск/пауза проєкту, ручна перевірка джерел, видалення каналу.

const Channel = require('../../../models/Channel');
const { processNews, processSingleChannel } = require('../../../services/postService');
const { renderChannelSettings } = require('../ui_renderers');
const { sendSubscriptionExpiredAlert } = require('./_shared');

const handleCheckOne = async (bot, query, user) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

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
    }).catch(() => {});
};

const handleForceCheckAll = async (bot, query, user) => {
    await bot.answerCallbackQuery(query.id, { text: '🚀 Запуск загальної перевірки' });
    await processNews(bot, user._id);
};

const handleDeleteConfirmMenu = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

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
};

const handleConfirmDelete = async (bot, query, user, callbacks) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    await Channel.findByIdAndDelete(data.slice(12));
    await bot.answerCallbackQuery(query.id, { text: '✅ Видалено' });
    return callbacks.sendMainMenu(chatId, messageId);
};

const handleToggleActive = async (bot, query, user) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const channelId = data.replace('user_ch_toggle_', '');
    const channel = await Channel.findById(channelId);

    if (!channel) return bot.answerCallbackQuery(query.id, { text: '❌ Проєкт не знайдено' });

    if (channel.userId.toString() !== user._id.toString() && user.role !== 'admin') {
        return bot.answerCallbackQuery(query.id, { text: '⛔ Це не ваш проєкт!' });
    }

    const tryingToActivate = !channel.isActive;

    if (tryingToActivate) {
        // 1. Перевірка терміну підписки (якщо тариф не FREE)
        if (user.subscription.plan !== 'free') {
            const isExpired = !user.subscription.expiresAt || new Date(user.subscription.expiresAt) < new Date();
            if (isExpired) {
                return sendSubscriptionExpiredAlert(bot, chatId, messageId);
            }
        }

        // 2. Перевірка ліміту тарифу
        const activeCount = await Channel.countDocuments({
            userId: user._id,
            isActive: true
        });

        if (activeCount >= user.subscription.maxChannels) {
            return bot.answerCallbackQuery(query.id, {
                text: `🔒 У вас ліміт (${user.subscription.maxChannels} шт). Придбайте тариф для запуску більшої кількості проєктів!`,
                show_alert: true
            });
        }
    }

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

    return renderChannelSettings(bot, chatId, messageId, channel, user);
};

module.exports = {
    handleCheckOne,
    handleForceCheckAll,
    handleDeleteConfirmMenu,
    handleConfirmDelete,
    handleToggleActive
};