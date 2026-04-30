// bot/callbacks/index.js

const User = require('../../models/User');
const adminHandler        = require('./admin');
const channelHandler      = require('./channels');
const wizardHandler       = require('./wizard');
const profileHandler      = require('./profile');
const instructionsHandler = require('./instructions');

const callbackHandler = async (bot, query, sendMainMenu, callbacks) => {
    const chatId    = query.message.chat.id;
    const data      = query.data;
    const messageId = query.message.message_id;

    console.log(`📥 Отримано клік: ${data}`);

    try {
        const user = await User.findOne({ telegramId: chatId.toString() });
        if (!user) return;

        const helpers = { sendMainMenu, ...callbacks };

        // Адмін
        if (data.startsWith('admin_')) {
            return await adminHandler(bot, query, user, callbackHandler);
        }

        // Профіль / магазин
        if (
            data === 'my_profile' ||
            data === 'subscription_shop' ||
            data.startsWith('buy_plan_') ||
            data === 'upgrade_plan'
        ) {
            return await profileHandler(bot, query, user, helpers);
        }

        // Майстер створення проєкту
        if (data === 'start_wizard') {
            return await wizardHandler(bot, query, user, helpers);
        }

        // Інструкція
        if (data === 'instr_main' || data.startsWith('instr_step_')) {
            return await instructionsHandler(bot, query);
        }

        // Головне меню
        if (data === 'main_menu' || data === 'main_menu_exit') {
            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                { $set: { tempState: null, tempData: { lastMenu: 'main_menu' } } }
            );
            return sendMainMenu(chatId, messageId);
        }

        // Всі інші (канали, джерела, промпти тощо)
        return await channelHandler(bot, query, user, helpers);

    } catch (e) {
        console.error('❌ Callback Router Error:', e.message);
        await bot.answerCallbackQuery(query.id, { text: '⚠️ Помилка обробки' }).catch(() => {});
    }
};

module.exports = { callbackHandler };