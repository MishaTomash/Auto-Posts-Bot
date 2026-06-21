// bot/callbacks/admin/logsExport.js
// Перегляд логів помилок та експорт користувачів у CSV.

const Log = require('../../../models/Log');
const { exportUsersToCSV } = require('../../../services/exportService');

const handleLogsErrors = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    const errors = await Log.find({ type: 'ERROR' }).sort({ createdAt: -1 }).limit(10);
    let logText = '❌ <b>Останні помилки:</b>\n\n';

    if (errors.length === 0) {
        logText += 'Помилок не знайдено.';
    } else {
        logText += errors.map(e => `🕒 ${e.createdAt.toLocaleString()}\n💬 ${e.details}`).join('\n---\n');
    }

    return bot.editMessageText(logText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin_main' }]] }
    });
};

const handleExportUsers = async (bot, query) => {
    const chatId = query.message.chat.id;

    await bot.answerCallbackQuery(query.id, { text: 'Генерую файл...' });
    const csvBuffer = await exportUsersToCSV();

    return bot.sendDocument(chatId, csvBuffer, {
        caption: '📊 Список користувачів (CSV)',
    }, {
        filename: `users_export_${new Date().toLocaleDateString()}.csv`,
        contentType: 'text/csv'
    });
};

module.exports = { handleLogsErrors, handleExportUsers };