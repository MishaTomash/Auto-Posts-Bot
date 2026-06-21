// bot/callbacks/renderers/adminDashboardRenderer.js
// Рендер головного дашборду адмінки зі статистикою.

const { getAdminStats } = require('../../../services/adminService');
const { getAdminDashboardKeyboard } = require('../../keyboards/admin');

const renderAdminDashboard = async (bot, chatId, messageId) => {
    try {
        const stats = await getAdminStats().catch(() => ({}));
        const now = new Date().toLocaleTimeString('uk-UA');

        const text = `<b>📊 ГОЛОВНИЙ ДАШБОРД</b>\n` +
            `<i>🕒 Оновлено о: ${now}</i>\n\n` +
            `👤 <b>Користувачі:</b> ${stats.general?.totalUsers || 0}\n` +
            `🆕 <b>Нових (24г):</b> ${stats.general?.newToday || 0}\n` +
            `📺 <b>Канали:</b> ${stats.channels?.total || 0}\n` +
            `📝 <b>Пости сьогодні:</b> ${stats.postsToday || 0}\n` +
            `💎 <b>Дохід:</b> ${stats.monthlyRevenue || 0} Stars`;

        return await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getAdminDashboardKeyboard()
        }).catch(err => {
            if (!err.message.includes('message is not modified')) {
                console.error('Render Dashboard Error:', err.message);
            }
        });
    } catch (err) {
        console.error('Critical Render Error:', err);
    }
};

module.exports = { renderAdminDashboard };