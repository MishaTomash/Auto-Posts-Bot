// bot/callbacks/admin/dashboard.js
// Головний дашборд адмінки.

const User = require('../../../models/User');
const { renderAdminDashboard } = require('../ui_renderers');

const handleDashboard = async (bot, query, user) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    await bot.answerCallbackQuery(query.id).catch(() => {});

    // NOTE: оригінальний код повторно фетчив юзера з БД і повторно перевіряв
    // роль тут, хоча це вже зроблено в adminHandler/_guard.ensureAdmin перед
    // викликом будь-якого підмодуля. Залишаю одну перевірку (на вході),
    // другу прибрав як дублюючу.

    return renderAdminDashboard(bot, chatId, messageId);
};

module.exports = { handleDashboard };