// bot/callbacks/admin/broadcast.js
// Розсилка повідомлень усім користувачам.

const User = require('../../../models/User');

const handleBroadcastStart = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: 'ADMIN_AWAITING_BROADCAST' });

    return bot.editMessageText('📢 <b>РЕЖИМ РОЗСИЛКИ</b>\n\nНадішліть повідомлення для всіх користувачів:', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Скасувати', callback_data: 'admin_dashboard' }]] }
    });
};

const handleBroadcastFinal = async (bot, query) => {
    const chatId = query.message.chat.id;

    const admin = await User.findOne({ telegramId: chatId.toString() });
    const { broadcastMsgId, broadcastFromChatId } = admin.tempData;
    const allUsers = await User.find({ isBlocked: { $ne: true } });

    bot.sendMessage(chatId, `🚀 Розсилка для ${allUsers.length} юзерів розпочата...`);

    for (const u of allUsers) {
        await bot.copyMessage(u.telegramId, broadcastFromChatId, broadcastMsgId).catch(() => {});
        await new Promise(r => setTimeout(r, 50));
    }

    return bot.sendMessage(chatId, '✅ Розсилку завершено!');
};

module.exports = { handleBroadcastStart, handleBroadcastFinal };