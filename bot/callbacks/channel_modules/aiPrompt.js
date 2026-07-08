// bot/callbacks/channel_modules/aiPrompt.js
// Перегляд, редагування та скидання AI-промпту каналу.

const User = require('../../../models/User');
const Channel = require('../../../models/Channel');
const { renderPromptSettings } = require('../ui_renderers');

const handleEditPromptMenu = async (bot, query, user) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const chId = data.replace('edit_prompt_', '');

    // ✅ Завжди беремо свіжого юзера з БД — щоб підписка була актуальна
    const freshUser = await User.findOne({ telegramId: chatId.toString() });
    const canEdit = freshUser?.role === 'admin' || freshUser?.subscription?.hasCustomPrompt === true;

    if (!canEdit) {
        return bot.editMessageText(
            `⚠️ <b>AI Промпти недоступні</b>\n\nНа тарифі FREE діє стандартний алгоритм.`,
            {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🚀 Оновити тариф', callback_data: 'subscription_shop' }],
                        [{ text: '🔙 Назад', callback_data: `manage_${chId}` }]
                    ]
                }
            }
        );
    }

    return renderPromptSettings(bot, chatId, messageId, chId);
};

const handleLockedAiFeature = async (bot, query) => {
    return bot.answerCallbackQuery(query.id, {
        text: '🔒 Ця функція доступна лише у платному тарифі.',
        show_alert: true
    });
};

const handleStartEditPrompt = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const channelId = data.replace('start_edit_prompt_', '');
    const ch = await Channel.findById(channelId);
    if (!ch) return;

    await User.findOneAndUpdate(
        { telegramId: chatId.toString() },
        {
            tempState: 'EDIT_PROMPT',
            'tempData.editingChannelId': channelId,
            'tempData.menuMessageId': messageId
        }
    );

    return bot.editMessageText(
        `📝 <b>Редагування промпту</b>\n\nКанал: <b>${ch.channelUsername}</b>\n\n` +
        `Будь ласка, <b>напишіть та відправте</b> новий текст промпту у цей чат.`,
        {
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Скасувати', callback_data: `edit_prompt_${channelId}` }]]
            }
        }
    );
};

const handleResetPrompt = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const chId = data.slice(13);
    await Channel.findByIdAndUpdate(chId, { aiPrompt: null });
    await bot.answerCallbackQuery(query.id, { text: '✅ Промпт скинуто до стандартного' });
    return renderPromptSettings(bot, chatId, messageId, chId);
};

module.exports = {
    handleEditPromptMenu,
    handleLockedAiFeature,
    handleStartEditPrompt,
    handleResetPrompt
};