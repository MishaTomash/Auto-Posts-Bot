// bot/callbacks/admin_modules/payments.js
// Підтвердження / відхилення ручних оплат через Monobank.

const Payment = require('../../../models/Payment');
const User    = require('../../../models/User');
const Plan    = require('../../../models/Plan');
const { activateSubscription } = require('../../../services/subscriptionService');

// ─── Підтвердити оплату ───────────────────────────────────────────────────────
const handlePaymentConfirm = async (bot, query) => {
    const chatId    = query.message.chat.id;
    const messageId = query.message.message_id;
    const paymentId = query.data.replace('payment_confirm_', '');

    try {
        const payment = await Payment.findById(paymentId);

        if (!payment) {
            return bot.answerCallbackQuery(query.id, {
                text: '⚠️ Платіж не знайдено', show_alert: true
            });
        }
        if (payment.status === 'confirmed' || payment.status === 'rejected') {
            return bot.answerCallbackQuery(query.id, {
                text: '⚠️ Платіж вже оброблено', show_alert: true
            });
        }

        const user = await User.findOne({ telegramId: payment.telegramId });
        const plan = await Plan.findOne({ name: payment.plan });

        if (!user || !plan) {
            return bot.answerCallbackQuery(query.id, {
                text: '⚠️ Користувача або тариф не знайдено', show_alert: true
            });
        }

        // Активуємо підписку
        await activateSubscription(user, plan);

        // Оновлюємо статус платежу
        payment.status = 'confirmed';
        await payment.save();

        // Сповіщаємо користувача
        const expiresAt  = user.subscription.expiresAt;
        const expiresStr = expiresAt
            ? expiresAt.toLocaleDateString('uk-UA')
            : '—';

        await bot.sendMessage(
            payment.telegramId,
            `✅ <b>Оплату підтверджено!</b>\n\n` +
            `💎 Тариф <b>${plan.displayName}</b> активовано.\n` +
            `📅 Діє до: <b>${expiresStr}</b>\n\n` +
            `Дякуємо за підписку! Бажаємо продуктивної роботи 🚀`,
            {
                parse_mode:   'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🏠 Головне меню', callback_data: 'main_menu' }
                    ]]
                }
            }
        );

        // Оновлюємо повідомлення адміна
        const userTag = user.username ? `@${user.username}` : `ID: ${payment.telegramId}`;
        await bot.editMessageText(
            `✅ <b>Оплату підтверджено</b>\n\n` +
            `👤 ${userTag}\n` +
            `💎 ${plan.displayName} — ${payment.amount} грн\n` +
            `🔑 <code>${payment.paymentCode}</code>\n\n` +
            `<i>Підписку активовано ✅</i>`,
            {
                chat_id:    chatId,
                message_id: messageId,
                parse_mode: 'HTML'
            }
        ).catch(() => {});

        await bot.answerCallbackQuery(query.id, { text: '✅ Підписку активовано!' });

    } catch (err) {
        console.error('❌ Payment Confirm Error:', err);
        await bot.answerCallbackQuery(query.id, {
            text: '⚠️ Помилка: ' + err.message, show_alert: true
        });
    }
};

// ─── Відхилити оплату ─────────────────────────────────────────────────────────
const handlePaymentReject = async (bot, query) => {
    const chatId    = query.message.chat.id;
    const messageId = query.message.message_id;
    const paymentId = query.data.replace('payment_reject_', '');

    try {
        const payment = await Payment.findById(paymentId);

        if (!payment) {
            return bot.answerCallbackQuery(query.id, {
                text: '⚠️ Платіж не знайдено', show_alert: true
            });
        }
        if (payment.status === 'confirmed' || payment.status === 'rejected') {
            return bot.answerCallbackQuery(query.id, {
                text: '⚠️ Платіж вже оброблено', show_alert: true
            });
        }

        const user = await User.findOne({ telegramId: payment.telegramId });
        const plan = await Plan.findOne({ name: payment.plan });

        payment.status = 'rejected';
        await payment.save();

        // Сповіщаємо користувача
        await bot.sendMessage(
            payment.telegramId,
            `❌ <b>Оплату відхилено</b>\n\n` +
            `На жаль, адміністратор не знайшов підтвердження вашого платежу.\n\n` +
            `💡 Переконайтеся, що ви:\n` +
            `• Перекинули правильну суму (<b>${payment.amount} грн</b>)\n` +
            `• Вказали код у коментарі: <code>${payment.paymentCode}</code>\n\n` +
            `Якщо вважаєте це помилкою — зверніться до підтримки.`,
            {
                parse_mode:   'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 Спробувати знову', callback_data: `buy_plan_${payment.plan}` }],
                        [{ text: '🏠 Головне меню',     callback_data: 'main_menu' }]
                    ]
                }
            }
        );

        // Оновлюємо повідомлення адміна
        const userTag = user?.username ? `@${user.username}` : `ID: ${payment.telegramId}`;
        await bot.editMessageText(
            `❌ <b>Оплату відхилено</b>\n\n` +
            `👤 ${userTag}\n` +
            `💎 ${plan?.displayName || payment.plan} — ${payment.amount} грн\n` +
            `🔑 <code>${payment.paymentCode}</code>\n\n` +
            `<i>Користувача повідомлено ❌</i>`,
            {
                chat_id:    chatId,
                message_id: messageId,
                parse_mode: 'HTML'
            }
        ).catch(() => {});

        await bot.answerCallbackQuery(query.id, { text: '❌ Оплату відхилено' });

    } catch (err) {
        console.error('❌ Payment Reject Error:', err);
        await bot.answerCallbackQuery(query.id, {
            text: '⚠️ Помилка: ' + err.message, show_alert: true
        });
    }
};

module.exports = { handlePaymentConfirm, handlePaymentReject };