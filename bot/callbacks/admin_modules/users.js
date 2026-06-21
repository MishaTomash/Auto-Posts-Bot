// bot/callbacks/admin/users.js
// Список користувачів, пошук, картка користувача, видалення, зміна тарифу.

const User = require('../../../models/User');
const Channel = require('../../../models/Channel');
const PLANS = require('../../../config/plans');

const { getUsersList } = require('../../../services/adminService');
const {
    getUsersKeyboard,
    getUserManageKeyboard,
    getConfirmKeyboard
} = require('../../keyboards/admin');

const handleUsersList = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    await bot.answerCallbackQuery(query.id).catch(() => {});
    const page = data.startsWith('admin_users_page_') ? parseInt(data.split('_')[3]) : 1;

    const { users, totalPages, totalCount } = await getUsersList(page, 10);
    const updateTime = new Date().toLocaleTimeString('uk-UA');

    const text = `👥 <b>Управління користувачами</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `Усього: <b>${totalCount}</b>\n` +
        `Сторінка: <b>${page}/${totalPages}</b>\n` +
        `<i>🕒 Оновлено о: ${updateTime}</i>`;

    return bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getUsersKeyboard(users, page, totalPages)
    });
};

const handleUserSearchStart = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: 'WAITING_FOR_ADMIN_USER_SEARCH' });

    return bot.editMessageText('🔍 <b>Пошук користувача</b>\n\nВведіть @username або прямий ID:', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Скасувати', callback_data: 'admin_users' }]] }
    });
};

const handleUserView = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const userId = data.split('_')[3];
    const targetUser = await User.findById(userId);
    if (!targetUser) return bot.answerCallbackQuery(query.id, { text: '❌ Користувача не знайдено' });

    const channelCount = await Channel.countDocuments({ userId: targetUser._id });

    const text = `👤 <b>Картка користувача</b>\n━━━━━━━━━━━━━━━━━━\n` +
        `<b>Ім'я:</b> @${targetUser.username || 'Немає'}\n` +
        `<b>ID:</b> <code>${targetUser.telegramId}</code>\n` +
        `<b>Роль:</b> ${targetUser.role}\n` +
        `<b>Тариф:</b> ${targetUser.subscription?.plan?.toUpperCase() || 'FREE'}\n` +
        `<b>Каналів:</b> ${channelCount}\n` +
        `━━━━━━━━━━━━━━━━━━\n🕒 <i>Оновлено: ${new Date().toLocaleTimeString('uk-UA')}</i>`;

    return bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getUserManageKeyboard(targetUser._id, targetUser.isBlocked)
    });
};

const handleUserDeleteRequest = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const userId = data.split('_')[4];

    await bot.answerCallbackQuery(query.id);

    await bot.editMessageText(
        '⚠️ <b>УВАГА!</b>\nВи намагаєтесь видалити користувача. Це видалить всі його канали та дані. Ви впевнені?',
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getConfirmKeyboard('deleteUser', userId)
        }
    );
};

const handleUserDeleteConfirm = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const targetId = data.split('_')[3];
    console.log(`🚀 ЗАПУСК ВИДАЛЕННЯ: ID ${targetId}`);

    try {
        await bot.answerCallbackQuery(query.id).catch(() => {});

        const channelResult = await Channel.deleteMany({ userId: targetId });
        console.log(`🗑 Видалено проєктів: ${channelResult.deletedCount}`);

        const userResult = await User.findByIdAndDelete(targetId);

        if (!userResult) {
            return bot.sendMessage(chatId, '❌ Користувача не знайдено.');
        }

        console.log(`✅ Юзер ${userResult.username} видалений успішно`);

        const { users, totalPages, totalCount } = await getUsersList(1, 10);
        const updateTime = new Date().toLocaleTimeString('uk-UA');
        const text = `👥 <b>Управління користувачами</b>\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `Усього: <b>${totalCount}</b>\n` +
            `Сторінка: 1/${totalPages}\n` +
            `<i>✅ Користувача видалено успішно! (${updateTime})</i>`;

        return await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getUsersKeyboard(users, 1, totalPages)
        });

    } catch (error) {
        console.error('🔴 Помилка при видаленні:', error.message);
    }
};

const handleUserPlanMenu = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const userId = data.split('_')[3];
    const plans = ['free', 'basic', 'pro', 'business'];

    const buttons = plans.map(plan => ([{
        text: plan.toUpperCase(),
        callback_data: `admin_set_plan_${plan}_${userId}`
    }]));
    buttons.push([{ text: '🔙 Назад до картки', callback_data: `admin_user_view_${userId}` }]);

    return bot.editMessageText('💎 <b>Оберіть новий тариф для користувача:</b>', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
};

const handleSetPlan = async (bot, query, user, callbackHandler) => {
    const chatId = query.message.chat.id;
    const { data } = query;

    try {
        const parts = data.split('_');
        const planName = parts[3];
        const userId = parts[4];

        const planConfig = PLANS[planName];
        if (!planConfig) return bot.answerCallbackQuery(query.id, { text: 'Тариф не знайдено' });

        await User.findByIdAndUpdate(userId, {
            $set: {
                'subscription.plan': planName,
                'subscription.maxChannels': planConfig.maxChannels,
                'subscription.maxPostsPerDay': planConfig.maxPostsPerDay,
                'subscription.expiresAt': planName === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }
        });

        await bot.answerCallbackQuery(query.id, { text: `✅ Тариф ${planName.toUpperCase()} встановлено!`, show_alert: true });

        if (typeof callbackHandler === 'function') {
            return callbackHandler(bot, { ...query, data: `admin_user_view_${userId}` }, user);
        }

        return bot.editMessageText('Оновлено. Поверніться до списку користувачів.', {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin_users' }]] }
        });

    } catch (error) {
        console.error('❌ Помилка при зміні тарифу:', error);
        bot.answerCallbackQuery(query.id, { text: '⚠️ Помилка БД' });
    }
};

module.exports = {
    handleUsersList,
    handleUserSearchStart,
    handleUserView,
    handleUserDeleteRequest,
    handleUserDeleteConfirm,
    handleUserPlanMenu,
    handleSetPlan
};