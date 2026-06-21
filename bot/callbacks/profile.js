// bot/callbacks/profile.js

const User    = require('../../models/User');
const Plan    = require('../../models/Plan');
const Payment = require('../../models/Payment');
const { renderProfile, renderSubscriptionShop } = require('./ui_renderers');
const { renderPaymentInstruction } = require('./renderers/planRenderer');

// ─── Генерація унікального коду платежу ──────────────────────────────────────
async function generateUniqueCode() {
    let code;
    let exists = true;
    while (exists) {
        const p1 = Math.floor(1000 + Math.random() * 9000); // 4 цифри
        const p2 = Math.floor(10   + Math.random() * 90);   // 2 цифри
        code   = `P-${p1}-${p2}`;
        exists = !!(await Payment.findOne({ paymentCode: code }));
    }
    return code;
}

// ─── Головний обробник ────────────────────────────────────────────────────────
const profileHandler = async (bot, query, user) => {
    const chatId    = query.message.chat.id;
    const data      = query.data;
    const messageId = query.message.message_id;

    try {
        // --- ПЕРЕГЛЯД ПРОФІЛЮ ---
        if (data === 'my_profile') {
            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                { 'tempData.lastMenu': 'my_profile' }
            );
            return renderProfile(bot, chatId, messageId, user);
        }

        // --- МАГАЗИН ПІДПИСОК ---
        if (data === 'subscription_shop') {
            try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
            return renderSubscriptionShop(bot, chatId, null, 'main_menu');
        }

        if (data === 'upgrade_plan') {
            return renderSubscriptionShop(bot, chatId, messageId, 'my_profile');
        }

        // --- ВИБІР ТАРИФУ: показуємо інструкцію оплати через Monobank ---
        if (data.startsWith('buy_plan_')) {
            const planName = data.replace('buy_plan_', '');
            const plan     = await Plan.findOne({ name: planName });

            if (!plan || plan.price <= 0) {
                return bot.answerCallbackQuery(query.id, { text: '⚠️ Помилка тарифу', show_alert: true });
            }

            // Генеруємо унікальний код
            const paymentCode = await generateUniqueCode();

            // Зберігаємо очікуючий платіж
            await Payment.create({
                userId:      user._id,
                telegramId:  chatId.toString(),
                plan:        plan.name,
                amount:      plan.price,
                paymentCode,
                status:      'pending'
            });

            // Видаляємо попереднє повідомлення (список тарифів)
            await bot.deleteMessage(chatId, messageId).catch(() => {});

            // Показуємо інструкцію оплати
            return renderPaymentInstruction(bot, chatId, plan, paymentCode);
        }

        // --- КОРИСТУВАЧ НАТИСНУВ "Я ОПЛАТИВ" ---
        if (data.startsWith('i_paid_')) {
            const paymentCode = data.replace('i_paid_', '');

            // Шукаємо тільки 'pending' — якщо вже надіслано, не дублюємо
            const payment = await Payment.findOne({
                paymentCode,
                telegramId: chatId.toString(),
                status:     'pending'
            });

            if (!payment) {
                return bot.answerCallbackQuery(query.id, {
                    text:       '⚠️ Запит вже надіслано або платіж не знайдено.',
                    show_alert: true
                });
            }

            // Змінюємо статус, щоб запобігти дублюванню
            payment.status = 'waiting_confirmation';
            await payment.save();

            const plan    = await Plan.findOne({ name: payment.plan });
            const adminId = process.env.ADMIN_TELEGRAM_ID;

            if (!adminId) {
                console.error('❌ ADMIN_TELEGRAM_ID не встановлено в .env');
                return bot.answerCallbackQuery(query.id, { text: '⚠️ Помилка конфігурації' });
            }

            // Сповіщаємо адміна
            const userTag   = user.username ? `@${user.username}` : `ID: ${chatId}`;
            const adminText =
                `🔔 <b>Новий запит на оплату!</b>\n\n` +
                `👤 Користувач: ${userTag} (<code>${chatId}</code>)\n` +
                `💎 Тариф: <b>${plan?.displayName || payment.plan}</b>\n` +
                `💰 Сума: <b>${payment.amount} грн</b>\n` +
                `🔑 Код: <code>${paymentCode}</code>\n\n` +
                `Перевір надходження і підтверди або відхили оплату.`;

            await bot.sendMessage(adminId, adminText, {
                parse_mode:   'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Підтвердити', callback_data: `payment_confirm_${payment._id}` },
                        { text: '❌ Відхилити',   callback_data: `payment_reject_${payment._id}` }
                    ]]
                }
            });

            // Відповідаємо користувачу
            await bot.answerCallbackQuery(query.id, {
                text:       '✅ Запит надіслано! Очікуйте підтвердження від адміністратора.',
                show_alert: true
            });

            // Оновлюємо повідомлення користувача
            await bot.editMessageText(
                `⏳ <b>Запит на оплату надіслано!</b>\n\n` +
                `💎 Тариф: <b>${plan?.displayName || payment.plan}</b>\n` +
                `💰 Сума: <b>${payment.amount} грн</b>\n` +
                `🔑 Код платежу: <code>${paymentCode}</code>\n\n` +
                `Адміністратор перевіряє ваш платіж. Ви отримаєте сповіщення після підтвердження.`,
                {
                    chat_id:      chatId,
                    message_id:   messageId,
                    parse_mode:   'HTML',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🏠 Головне меню', callback_data: 'main_menu' }
                        ]]
                    }
                }
            ).catch(() => {});
        }

    } catch (error) {
        console.error('❌ Profile Handler Error:', error.message);
        await bot.answerCallbackQuery(query.id, { text: '⚠️ Помилка обробки' });
    }
};

module.exports = profileHandler;