// bot/callbacks/renderers/promptRenderer.js
// Рендер картки налаштувань AI-промпту каналу.

const Channel = require('../../../models/Channel');
const { DEFAULT_PROMPT } = require('../../../services/aiService');
const { escapeHTML } = require('./_escapeHTML');

const renderPromptSettings = async (bot, chatId, messageId, chId) => {
    try {
        const ch = await Channel.findById(chId);
        if (!ch) return;

        // Перевіряємо, чи є в базі кастомний текст
        const isCustom = ch.aiPrompt !== null && ch.aiPrompt !== undefined;

        // Визначаємо, який текст показати в меню
        const rawPrompt = isCustom ? ch.aiPrompt : DEFAULT_PROMPT;
        const safePrompt = escapeHTML(rawPrompt);

        const statusLabel = isCustom ? '🟡 Кастомний' : '🟢 Стандартний';

        const text = `🤖 <b>Налаштування AI Промпту</b>\n\n` +
            `Статус: ${statusLabel}\n\n` +
            `<b>Текст промпту:</b>\n<code>${safePrompt}</code>`;

        const keyboard = [];

        // Кнопка зміни є завжди
        keyboard.push([{ text: '✏️ Змінити промпт', callback_data: `start_edit_prompt_${chId}` }]);

        // Кнопка "Скинути" показується ТІЛЬКИ якщо зараз стоїть кастомний текст
        if (isCustom) {
            keyboard.push([{ text: '🔄 Скинути до стандартного', callback_data: `reset_prompt_${chId}` }]);
        }

        keyboard.push([{ text: '⬅️ Назад до налаштувань', callback_data: `manage_${chId}` }]);

        const options = {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        };

        if (messageId) {
            return await bot.editMessageText(text, options);
        } else {
            return await bot.sendMessage(chatId, text, options);
        }
    } catch (error) {
        console.error('❌ Помилка в renderPromptSettings:', error);
    }
};

module.exports = { renderPromptSettings };