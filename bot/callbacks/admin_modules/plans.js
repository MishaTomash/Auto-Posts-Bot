// bot/callbacks/admin/plans.js
// Управління тарифами: список, картка, редагування ціни/лімітів, AI toggle.

const User = require('../../../models/User');
const Plan = require('../../../models/Plan');

const { getAllPlans } = require('../../../services/adminService');
const { getAdminPlansKeyboard } = require('../../keyboards/admin');
const { renderPlanEditCard } = require('../ui_renderers');

const handlePlansList = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    await bot.answerCallbackQuery(query.id).catch(() => {});

    const plans = await getAllPlans();

    if (!plans || plans.length === 0) {
        return bot.editMessageText('⚠️ <b>Тарифи відсутні в базі даних.</b>', {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin_dashboard' }]] }
        });
    }

    return bot.editMessageText('💳 <b>Управління тарифами</b>\n\nОберіть тариф для редагування:', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getAdminPlansKeyboard(plans)
    });
};

const handlePlanView = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const planId = data.split('_')[3];
    return renderPlanEditCard(bot, chatId, messageId, planId);
};

const handlePlanToggleAi = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const planId = data.split('_')[4];
    const currentPlan = await Plan.findById(planId);
    const newValue = !currentPlan.hasCustomPrompt;
    await Plan.findByIdAndUpdate(planId, { $set: { hasCustomPrompt: newValue } });
    return renderPlanEditCard(bot, chatId, messageId, planId);
};

const handlePlanEditField = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const [, , , field, planId] = data.split('_'); // price, channels, posts

    await User.findOneAndUpdate(
        { telegramId: chatId.toString() },
        {
            tempState: `ADMIN_PLAN_EDIT_${field.toUpperCase()}`,
            tempData: { editingPlanId: planId }
        }
    );

    const labels = { price: 'ціну (Stars)', channels: 'ліміт каналів', posts: 'ліміт постів' };
    return bot.editMessageText(`📝 Введіть нову **${labels[field] || field}** (цифрами):`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '❌ Скасувати', callback_data: `admin_plan_view_${planId}` }]] }
    });
};

module.exports = {
    handlePlansList,
    handlePlanView,
    handlePlanToggleAi,
    handlePlanEditField
};