// bot/callbacks/channel_modules/sources.js
// Додавання, перегляд і видалення Telegram-джерел каналу.

const User = require('../../../models/User');
const Channel = require('../../../models/Channel');
const { renderSourcesList } = require('../ui_renderers');

const handleAddSourceStart = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const channelId = data.split('_')[2];

    await User.findOneAndUpdate(
        { telegramId: chatId.toString() },
        {
            tempState: 'WAITING_TG_SOURCE',
            tempData: { targetChannelId: channelId, instructionMessageId: messageId }
        }
    );

    return bot.editMessageText(
        `📱 <b>Додавання Telegram-джерела</b>\n\n` +
        `Надішліть посилання на канал:\n` +
        `• <code>https://t.me/username</code>\n` +
        `• <code>@username</code>`,
        {
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Скасувати', callback_data: `sources_list_${channelId}` }]]
            }
        }
    );
};

const handleSourcesList = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    return renderSourcesList(bot, chatId, messageId, data.slice(13));
};

const handleRemoveSource = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const parts = data.split('_');
    const chId = parts[2];
    const index = parseInt(parts[3]);
    const ch = await Channel.findById(chId);

    if (ch?.tgSources?.[index] !== undefined) {
        ch.tgSources.splice(index, 1);
        await ch.save();
        await bot.answerCallbackQuery(query.id, { text: 'Джерело видалено' });
        return renderSourcesList(bot, chatId, messageId, chId);
    }

    return bot.answerCallbackQuery(query.id, { text: 'Помилка: джерело не знайдено', show_alert: true });
};

module.exports = { handleAddSourceStart, handleSourcesList, handleRemoveSource };