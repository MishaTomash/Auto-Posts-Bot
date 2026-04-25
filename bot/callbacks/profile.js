// bot/callbacks/profile.js

const User = require('../../models/User');
const Plan = require('../../models/Plan');
const { renderProfile, renderSubscriptionShop } = require('./ui_renderers');

const profileHandler = async (bot, query, user) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;

    try {
        // --- ПЕРЕГЛЯД ПРОФІЛЮ ---
        if (data === 'my_profile') {
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { 'tempData.lastMenu': 'my_profile' });
            return renderProfile(bot, chatId, messageId, user);
        }

        // --- МАГАЗИН ПІДПИСОК ---
        if (data === 'subscription_shop') {
            return renderSubscriptionShop(bot, chatId, messageId, 'main_menu');
        }

        if (data === 'upgrade_plan') {
            return renderSubscriptionShop(bot, chatId, messageId, 'my_profile');
        }

        // --- КУПІВЛЯ (ГЕНЕРАЦІЯ ІНВОЙСУ) ---
        if (data.startsWith('buy_plan_')) {
            const planName = data.split('_')[2];
            const plan = await Plan.findOne({ name: planName });

            if (!plan || plan.price <= 0) {
                return bot.answerCallbackQuery(query.id, { text: "⚠️ Цей тариф неможливо купити" });
            }

            console.log(`💳 Створення інвойсу: ${plan.displayName} за ${plan.price} Stars`);

            return await bot.sendInvoice(
                chatId,
                `Тариф ${plan.displayName}`,
                `Доступ до ${plan.maxChannels} к-лів та ${plan.maxPostsPerDay} постів/день`,
                `plan_payment_${planName}_${chatId}`,
                '',      // Provider token (empty for Stars)
                'XTR',   // Currency
                [{ label: `Купівля ${plan.displayName}`, amount: plan.price }]
            );
        }

    } catch (error) {
        console.error("❌ Profile Handler Error:", error.message);
        await bot.answerCallbackQuery(query.id, { text: "⚠️ Помилка платежу" });
    }
};

module.exports = profileHandler;