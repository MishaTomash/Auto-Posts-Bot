const User = require('../../models/User');

const isAdmin = async (chatId) => {
    // Отримуємо ID з env, видаляємо можливі пробіли
    const mainAdminId = String(process.env.ADMIN_TELEGRAM_ID || '').trim();
    const currentChatId = String(chatId).trim();

    // 1. Пряма перевірка по ID з .env
    if (currentChatId === mainAdminId) return true;

    // 2. Перевірка по базі даних
    const user = await User.findOne({ telegramId: currentChatId });
    return user && user.role === 'admin';
};

module.exports = { isAdmin };