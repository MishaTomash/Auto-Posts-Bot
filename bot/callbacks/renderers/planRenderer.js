// bot/callbacks/renderers/planRenderer.js
// Рендер картки тарифу (адмін) та магазину підписок (юзер).

const User = require('../../../models/User');
const Plan = require('../../../models/Plan');
const { getPlanEditKeyboard } = require('../../keyboards/admin');

// ─── Адмін: картка редагування тарифу ────────────────────────────────────────
const renderPlanEditCard = async (bot, chatId, messageId, planId) => {
    try {
        const plan = await Plan.findById(planId);
        if (!plan) return;

        const now        = new Date().toLocaleTimeString('uk-UA');
        const isAiEnabled = !!plan.hasCustomPrompt;

        const text =
            `⚙️ <b>Налаштування тарифу: ${plan.name.toUpperCase()}</b>\n\n` +
            `💰 Ціна: <b>${plan.price} грн</b>\n` +
            `📺 Макс. каналів: <b>${plan.maxChannels}</b>\n` +
            `📝 Постів на день: <b>${plan.maxPostsPerDay}</b>\n` +
            `🤖 Custom AI Промпт: <b>${isAiEnabled ? '✅ Увімкнено' : '❌ Вимкнено'}</b>\n\n` +
            `<i>🕒 Останнє оновлення: ${now}</i>`;

        return await bot.editMessageText(text, {
            chat_id:      chatId,
            message_id:   messageId,
            parse_mode:   'HTML',
            reply_markup: getPlanEditKeyboard(planId, isAiEnabled)
        }).catch(err => {
            if (!err.message.includes('message is not modified')) {
                console.error('Render Error:', err.message);
            }
        });
    } catch (err) {
        console.error('Critical Render Error:', err);
    }
};

// ─── Юзер: магазин підписок ───────────────────────────────────────────────────
const renderSubscriptionShop = async (bot, chatId, messageId, backTarget) => {
    const allPlans  = await Plan.find({ isActive: true }).sort({ price: 1 });
    const user      = await User.findOne({ telegramId: chatId.toString() });

    const freePlan      = allPlans.find(p => p.name === 'free');
    const paidPlans     = allPlans.filter(p => p.name !== 'free');
    const userCurrPlan  = user?.subscription?.plan || 'free';

    let message = '💎 <b>ОБЕРІТЬ ТАРИФ</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n';

    if (freePlan) {
        message +=
            `🆓 <b>${freePlan.displayName}</b> — Безкоштовно\n` +
            `• Каналів: ${freePlan.maxChannels}\n` +
            `• Постів на день: ${freePlan.maxPostsPerDay}\n` +
            `• AI Промпт: ❌\n\n`;
    }

    const keyboard = { inline_keyboard: [] };

    for (const plan of paidPlans) {
        const title = plan.displayName || plan.name.toUpperCase();
        const price = plan.price ?? 0;

        message +=
            `💎 <b>${title}</b> — ${price} грн / 30 днів\n` +
            `• Каналів: ${plan.maxChannels}\n` +
            `• Постів на день: ${plan.maxPostsPerDay}\n` +
            `• AI Промпт: ${plan.hasCustomPrompt ? '✅' : '❌'}\n\n`;

        const isCurrent = plan.name === userCurrPlan;
        const btnText   = isCurrent
            ? `🔄 Продовжити ${title} (${price} грн)`
            : `💳 Купити ${title} (${price} грн)`;

        keyboard.inline_keyboard.push([{ text: btnText, callback_data: `buy_plan_${plan.name}` }]);
    }

    keyboard.inline_keyboard.push([{ text: '⬅️ Назад', callback_data: backTarget }]);

    const options = { parse_mode: 'HTML', reply_markup: keyboard };

    if (messageId) {
        try {
            return await bot.editMessageText(message, {
                chat_id:    chatId,
                message_id: messageId,
                ...options
            });
        } catch (err) {
            if (
                err.message.includes("message can't be edited") ||
                err.message.includes('message to edit not found')
            ) {
                await bot.deleteMessage(chatId, messageId).catch(() => {});
            } else {
                console.error('Помилка рендеру магазину:', err.message);
                return;
            }
        }
    }

    return await bot.sendMessage(chatId, message, options);
};

// ─── Юзер: інструкція для оплати через Monobank ──────────────────────────────
const renderPaymentInstruction = async (bot, chatId, plan, paymentCode) => {
    const cardNumber = process.env.MONO_CARD_NUMBER || '4441 1111 5819 5697';

    const text =
        `💳 <b>Оплата тарифу ${plan.displayName}</b>\n\n` +
        `💰 Вартість: <b>${plan.price} грн</b>\n` +
        `📅 Термін дії: <b>30 днів</b>\n\n` +
        `Перекажи кошти на картку Монобанку:\n` +
        `<code>${cardNumber}</code>\n` +
        `(натисни, щоб скопіювати)\n\n` +
        `⚠️ <b>ОБОВ'ЯЗКОВО</b> вкажи цей код у коментарі до переказу:\n` +
        `<code>${paymentCode}</code>\n\n` +
        `Після переказу натисни кнопку нижче 👇`;

    const keyboard = {
        inline_keyboard: [
            [{ text: '✅ Я оплатив', callback_data: `i_paid_${paymentCode}` }],
            [{ text: '⬅️ Назад до тарифів', callback_data: 'subscription_shop' }]
        ]
    };

    return await bot.sendMessage(chatId, text, {
        parse_mode:   'HTML',
        reply_markup: keyboard
    });
};

module.exports = { renderPlanEditCard, renderSubscriptionShop, renderPaymentInstruction };