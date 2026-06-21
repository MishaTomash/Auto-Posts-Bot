// bot/handlers/text_states/promptEdit.js
// Обробка стану EDIT_PROMPT: користувач надсилає новий текст AI-промпту.

const User = require('../../../models/User');
const Channel = require('../../../models/Channel');
const { renderPromptSettings } = require('../../callbacks/ui_renderers');

const handleEditPrompt = async (bot, chatId, msg, text, user) => {
    const editingId = user.tempData?.editingChannelId;
    if (!editingId) return;

    // ID повідомлення, яке треба "перетворити" назад на меню
    const menuId = user.tempData.menuMessageId;

    // Зберігаємо текст у базу
    await Channel.findByIdAndUpdate(editingId, { aiPrompt: text.trim() });

    // Очищаємо стан
    await User.findOneAndUpdate(
        { telegramId: chatId.toString() },
        { tempState: null, tempData: {} }
    );

    // Видаляємо повідомлення з текстом, який написав користувач (чистимо чат)
    bot.deleteMessage(chatId, msg.message_id).catch(() => {});

    // Оновлюємо старе повідомлення (замість інструкції показуємо знову налаштування)
    if (menuId) {
        return renderPromptSettings(bot, chatId, menuId, editingId);
    }
    return renderPromptSettings(bot, chatId, null, editingId);
};

module.exports = { handleEditPrompt };