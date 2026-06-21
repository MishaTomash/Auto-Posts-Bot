// bot/callbacks/renderers/sourcesRenderer.js
// Рендер списку Telegram-джерел каналу.

const Channel = require('../../../models/Channel');

const renderSourcesList = async (bot, chatId, messageId, chId) => {
    const ch = await Channel.findById(chId);
    if (!ch) return;

    let text = `📋 <b>Telegram-джерела для:</b> ${ch.channelUsername || 'каналу'}\n\n`;
    const keyboard = [];

    if (ch.tgSources && ch.tgSources.length > 0) {
        text += `📱 <b>Список підключених каналів:</b>\n`;
        ch.tgSources.forEach((src, index) => {
            text += `${index + 1}. <code>${src.url}</code>\n`;
            keyboard.push([{
                text: `🗑 Видалити джерело №${index + 1}`,
                callback_data: `remove_tgsrc_${chId}_${index}`
            }]);
        });
    } else {
        text += `<i>Джерел поки не додано. Бот не має звідки брати контент.</i>`;
    }

    keyboard.push([{ text: '➕ Додати TG Канал', callback_data: `add_tgsrc_${chId}` }]);
    keyboard.push([{ text: '⬅️ Назад до налаштувань', callback_data: `manage_${chId}` }]);

    const options = {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: keyboard }
    };

    try {
        if (messageId) {
            // Намагаємося відредагувати старе меню
            await bot.editMessageText(text, options);
        } else {
            // Якщо ID немає — шлемо нове повідомлення
            await bot.sendMessage(chatId, text, options);
        }
    } catch (err) {
        // Якщо редагування неможливе (наприклад, повідомлення застаріло), шлемо нове
        await bot.sendMessage(chatId, text, options);
    }
};

module.exports = { renderSourcesList };