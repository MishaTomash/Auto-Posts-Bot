// bot/callbacks/channel_modules/_shared.js
// Спільні утиліти, що використовуються кількома channel-підмодулями.

// Повертає true якщо тариф FREE або підписка ще діє
const hasActiveSubscription = (user) => {
    if (user.subscription.plan === 'free') return true;
    if (!user.subscription.expiresAt) return false;
    return new Date(user.subscription.expiresAt) > new Date();
};

// Повідомлення про необхідність купити тариф
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

module.exports = { hasActiveSubscription, sendSubscriptionExpiredAlert };