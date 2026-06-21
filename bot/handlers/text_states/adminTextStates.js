// bot/handlers/text_states/adminTextStates.js
// Текстові стани адмінки: пошук користувача, редагування полів тарифу.

const User = require('../../../models/User');
const Plan = require('../../../models/Plan');
const { getUsersList } = require('../../../services/adminService');
const { getUsersKeyboard } = require('../../keyboards/admin');

const handleAdminUserSearch = async (bot, chatId, msg, text) => {
    const searchTerm = text.trim().replace('@', '');

    const { users, totalCount } = await getUsersList(1, 10, { search: searchTerm });

    await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: null });
    bot.deleteMessage(chatId, msg.message_id).catch(() => {});

    if (!users || users.length === 0) {
        return bot.sendMessage(chatId, `❌ Користувача <b>${searchTerm}</b> не знайдено.`, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🔍 Спробувати знову', callback_data: 'admin_user_search' }]] }
        });
    }

    return bot.sendMessage(chatId, `🔍 Знайдено результатів: ${totalCount}`, {
        parse_mode: 'HTML',
        reply_markup: getUsersKeyboard(users, 1, 1)
    });
};

const handleAdminPlanEdit = async (bot, chatId, text, user, state) => {
    const fieldType = state.replace('ADMIN_PLAN_EDIT_', '').toLowerCase();
    const planId = user.tempData.editingPlanId;
    const newValue = parseInt(text);

    if (isNaN(newValue)) return bot.sendMessage(chatId, '❌ Введіть число.');

    const updateData = {};
    if (fieldType === 'price') updateData.price = newValue;
    if (fieldType === 'channels') updateData.maxChannels = newValue;
    if (fieldType === 'posts') updateData.maxPostsPerDay = newValue;

    await Plan.findByIdAndUpdate(planId, updateData);
    await User.updateOne({ telegramId: chatId.toString() }, { tempState: null, tempData: {} });

    return bot.sendMessage(chatId, '✅ Тариф оновлено!', {
        reply_markup: { inline_keyboard: [[{ text: '📊 Назад', callback_data: `admin_plan_view_${planId}` }]] }
    });
};

module.exports = { handleAdminUserSearch, handleAdminPlanEdit };