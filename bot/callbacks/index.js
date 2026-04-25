// bot/callbacks/index.js

const User = require('../../models/User');
const adminHandler = require('./admin');
const channelHandler = require('./channels');
const wizardHandler = require('./wizard');
const profileHandler = require('./profile');

const callbackHandler = async (bot, query, sendMainMenu, callbacks) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;

    console.log(`📥 Отримано клік: ${data}`);

    try {
        const user = await User.findOne({ telegramId: chatId.toString() });
        if (!user) return;

        // Створюємо єдиний об'єкт "хендлерів", куди додаємо sendMainMenu
        const helpers = {
            sendMainMenu,
            ...callbacks
        };

        if (data.startsWith('admin_')) {
            // Передаємо helpers замість sendMainMenu
            return await adminHandler(bot, query, user, callbackHandler);
        }

        if (data === 'my_profile' || data === 'subscription_shop' || data.startsWith('buy_plan_') || data === 'upgrade_plan') {
            return await profileHandler(bot, query, user, helpers);
        }

        if (data === 'start_wizard') {
            return await wizardHandler(bot, query, user, helpers);
        }

        if (data === 'main_menu' || data === 'main_menu_exit') {
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { 'tempData.lastMenu': 'main_menu' });
            return sendMainMenu(chatId, messageId);
        }

        // Тут тепер helpers містить sendMainMenu, тому TypeError зникне
        return await channelHandler(bot, query, user, helpers);

    } catch (e) {
        console.error("❌ Callback Router Error:", e.message);
        await bot.answerCallbackQuery(query.id, { text: "⚠️ Помилка обробки" }).catch(() => { });
    }
};

module.exports = { callbackHandler };