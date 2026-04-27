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

        if (data === 'subscription_shop') {
            // ВАЖЛИВО: спочатку видаляємо, потім малюємо нове
            try {
                await bot.deleteMessage(chatId, messageId);
            } catch (e) {
                console.log("Не вдалося видалити інвойс, можливо він вже видалений");
            }

            // Передаємо null замість messageId, щоб renderSubscriptionShop надіслав НОВЕ повідомлення
            return renderSubscriptionShop(bot, chatId, null, 'main_menu');
        }

        if (data === 'upgrade_plan') {
            return renderSubscriptionShop(bot, chatId, messageId, 'my_profile');
        }

        // --- КУПІВЛЯ (ГЕНЕРАЦІЯ ІНВОЙСУ) ---
        if (data.startsWith('buy_plan_')) {
            const planName = data.split('_')[2];
            const plan = await Plan.findOne({ name: planName });

            if (!plan || plan.price <= 0) {
                return bot.answerCallbackQuery(query.id, { text: "⚠️ Помилка тарифу" });
            }

            // 1. ВИДАЛЯЄМО старе повідомлення (будь то список тарифів чи старий інвойс)
            await bot.deleteMessage(chatId, messageId).catch(() => { });

            console.log(`💳 Створення інвойсу: ${plan.displayName}`);

            // 2. Надсилаємо НОВИЙ інвойс
            return await bot.sendInvoice(
                chatId,
                `Тариф ${plan.displayName}`,
                `Доступ до ${plan.maxChannels} к-лів та ${plan.maxPostsPerDay} постів/день`,
                `plan_payment_${planName}_${chatId}`,
                '', 'XTR',
                [{ label: `${plan.displayName}`, amount: plan.price }],
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: `Оплатити ⭐ ${plan.price}`, pay: true }],
                            [{ text: '⬅️ Назад до тарифів', callback_data: 'subscription_shop' }]
                        ]
                    }
                }
            );
        }

    } catch (error) {
        console.error("❌ Profile Handler Error:", error.message);
        await bot.answerCallbackQuery(query.id, { text: "⚠️ Помилка платежу" });
    }
};

module.exports = profileHandler;