// bot/callbacks/channel_modules/schedule.js
// Інтервал перевірки джерел і режим "розклад по годинах".

const User = require('../../../models/User');
const Channel = require('../../../models/Channel');
const { getIntervalKeyboard, getScheduleKeyboard } = require('../../keyboards/channel');
const { renderChannelSettings } = require('../ui_renderers');

const handleEditIntervalMenu = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const chId = data.replace('edit_interval_', '');
    const ch = await Channel.findById(chId);
    if (!ch) return bot.answerCallbackQuery(query.id, { text: '❌ Проєкт не знайдено' });

    return bot.editMessageText('⏱ <b>Змінити інтервал</b>\nОберіть режим або введіть час:', {
        chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
        reply_markup: { inline_keyboard: getIntervalKeyboard(ch) }
    });
};

const handleSetInterval = async (bot, query, user) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const [, , chId, minutes] = data.split('_');
    const updatedChannel = await Channel.findByIdAndUpdate(
        chId, { checkInterval: parseInt(minutes) }, { new: true }
    );
    return renderChannelSettings(bot, chatId, messageId, updatedChannel, user);
};

const handleManualIntervalStart = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

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
};

const handleOpenSchedule = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

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
};

const handleToggleHour = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

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
};

const handleSetModeInterval = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const chId = data.split('_')[3];
    await Channel.findByIdAndUpdate(chId, { scheduleMode: 'interval' });
    await bot.answerCallbackQuery(query.id, { text: '🔄 Увімкнено режим інтервалів' });

    const ch = await Channel.findById(chId);
    return bot.editMessageText('⏱ <b>Налаштування інтервалу</b>\nОберіть, як часто перевіряти джерела:', {
        chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
        reply_markup: { inline_keyboard: getIntervalKeyboard(ch) }
    });
};
const handleSetDailyLimit = async (bot, query, user) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const parts = data.split('_');
    const chId = parts[2];
    const limit = Math.min(200, Math.max(1, parseInt(parts[3])));

    const updatedCh = await Channel.findByIdAndUpdate(
        chId,
        { dailyPostLimit: limit },
        { new: true }
    );

    await bot.answerCallbackQuery(query.id, { text: `✅ Ліміт: ${limit} постів/день` });

    return bot.editMessageReplyMarkup(
        { inline_keyboard: getIntervalKeyboard(updatedCh) },
        { chat_id: chatId, message_id: messageId }
    );
};
const handleManualLimit = async (bot, chatId, msg, text, user) => {
    const chId = user.tempData.targetChannelId;
    const instructionMessageId = user.tempData.instructionMessageId;
    const limit = parseInt(text);

    await bot.deleteMessage(chatId, msg.message_id).catch(() => {});

    if (isNaN(limit) || limit < 1 || limit > 200) {
        const errorMsg = await bot.sendMessage(chatId, '❌ Введіть число від 1 до 200');
        setTimeout(() => bot.deleteMessage(chatId, errorMsg.message_id).catch(() => {}), 3000);
        return;
    }

    const updatedCh = await Channel.findByIdAndUpdate(
        chId,
        { dailyPostLimit: limit },
        { new: true }
    );

    await User.findOneAndUpdate(
        { telegramId: chatId.toString() },
        { tempState: null, tempData: {} }
    );

    await bot.editMessageText('⏱ <b>Розклад та ліміт постів</b>\nОберіть режим або введіть час:', {
        chat_id: chatId,
        message_id: instructionMessageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: getIntervalKeyboard(updatedCh) }
    }).catch(() => {});

    const successMsg = await bot.sendMessage(chatId, `✅ Ліміт встановлено: ${limit} постів/день`);
    setTimeout(() => bot.deleteMessage(chatId, successMsg.message_id).catch(() => {}), 3000);
};

module.exports = {
    handleEditIntervalMenu,
    handleSetInterval,
    handleManualIntervalStart,
    handleOpenSchedule,
    handleToggleHour,
    handleSetDailyLimit,
    handleSetModeInterval,
    handleManualLimit
};