// bot/callbacks/admin/_guard.js
// Спільна перевірка прав адміністратора для всіх admin-підмодулів.

const User = require('../../../models/User');

/**
 * Перевіряє права адміна. Якщо в юзера ще немає ролі admin,
 * але його telegramId збігається з ADMIN_TELEGRAM_ID — призначає роль автоматично.
 * Повертає true, якщо доступ дозволено.
 */
const ensureAdmin = async (bot, query, user) => {
    if (user.telegramId === process.env.ADMIN_TELEGRAM_ID && user.role !== 'admin') {
        user.role = 'admin';
        await user.save();
        console.log(`⭐ Користувачу ${user.username} автоматично надано права адміна`);
    }

    if (!user || user.role !== 'admin') {
        await bot.answerCallbackQuery(query.id, {
            text: '⛔ Доступ заборонено! Ви не є адміністратором.',
            show_alert: true
        });
        return false;
    }

    return true;
};

module.exports = { ensureAdmin };