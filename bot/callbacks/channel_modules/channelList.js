// bot/callbacks/channel_modules/channelList.js
// Список каналів користувача та відкриття меню налаштувань конкретного каналу.

const Channel = require('../../../models/Channel');
const { renderChannelSettings } = require('../ui_renderers');

const handleListChannels = async (bot, query, user) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    const channels = await Channel.find({ userId: user._id });

    if (channels.length === 0) {
        return bot.editMessageText('📊 <b>Список порожній.</b>', {
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Створити проект', callback_data: 'start_wizard' }],
                    [{ text: '🏠 Меню', callback_data: 'main_menu' }]
                ]
            }
        });
    }

    const keyboard = channels.map(ch => ([{
        text: `📺 ${ch.channelUsername || 'Без назви'} (/${ch.checkInterval}хв)`,
        callback_data: `manage_${ch._id}`
    }]));
    keyboard.push([{ text: '🚀 Перевірити всі зараз', callback_data: 'force_check_all' }]);
    keyboard.push([{ text: '⬅️ Назад', callback_data: 'main_menu' }]);

    return bot.editMessageText('📊 <b>Ваші канали:</b>', {
        chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
};

const handleManageChannel = async (bot, query, user) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const channelId = data.includes('manage_') ? data.split('_')[1] : data.split('_')[2];
    const channel = await Channel.findById(channelId);
    if (!channel) return bot.answerCallbackQuery(query.id, { text: '❌ Канал не знайдено' });

    return renderChannelSettings(bot, chatId, messageId, channel, user);
};

module.exports = { handleListChannels, handleManageChannel };