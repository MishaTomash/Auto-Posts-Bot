// bot/callbacks/admin/channels.js
// Список каналів, картка каналу, toggle активності, джерела каналу (для адміна).

const Channel = require('../../../models/Channel');

const { getChannelsList } = require('../../../services/adminService');
const {
    getChannelsKeyboard,
    getChannelAdminControlKeyboard,
    getChannelSourcesKeyboard,
    getSourceConfirmKeyboard
} = require('../../keyboards/admin');
const { renderChannelSettings } = require('../ui_renderers');

const handleChannelsList = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const page = data.startsWith('admin_ch_page_') ? parseInt(data.split('_')[3]) : 1;
    const { channels, totalPages, totalCount } = await getChannelsList(page);

    return bot.editMessageText(`📺 <b>Список усіх каналів</b> (${totalCount})\nСторінка ${page}/${totalPages}:`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getChannelsKeyboard(channels, page, totalPages)
    });
};

const handleChannelView = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const chId = data.replace('admin_ch_view_', '');
    const channel = await Channel.findById(chId).populate('userId');

    const text = `📺 <b>Канал:</b> ${channel.channelUsername}\n` +
        `👤 <b>Власник:</b> @${channel.userId?.username || 'ID:' + channel.userId?.telegramId}\n` +
        `📊 <b>Статус:</b> ${channel.isActive ? '✅ Активний' : '❌ Пауза'}`;

    return bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getChannelAdminControlKeyboard(chId, channel.isActive)
    });
};

const handleChannelDelete = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const chId = data.split('_')[3];

    try {
        await bot.answerCallbackQuery(query.id, { text: 'Канал видаляється...' });

        await Channel.findByIdAndDelete(chId);
        console.log(`[TMX] Канал ${chId} успішно видалено`);

        const { channels, totalPages, totalCount } = await getChannelsList(1);

        return bot.editMessageText(
            `📺 <b>Список усіх каналів</b> (${totalCount})\nСторінка 1/${totalPages}:`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: getChannelsKeyboard(channels, 1, totalPages)
            }
        );

    } catch (e) {
        console.error('Помилка в блоці видалення:', e);
        await bot.answerCallbackQuery(query.id, { text: 'Помилка при видаленні' }).catch(() => {});
    }
};

const handleChannelToggle = async (bot, query, user) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const channelId = data.replace('admin_ch_toggle_', '');
    const channel = await Channel.findById(channelId);

    if (!channel) return bot.answerCallbackQuery(query.id, { text: '❌ Не знайдено' });

    channel.isActive = !channel.isActive;
    await channel.save();

    await bot.answerCallbackQuery(query.id, {
        text: channel.isActive ? '🚀 Проєкт активовано' : '⏸ На паузі'
    });

    // ВИПРАВЛЕНО: в оригіналі тут викликалась неіснуюча функція showChannelSettings(),
    // якої немає серед імпортів файлу — це викликало б ReferenceError під час кліку.
    // Замінено на renderChannelSettings, яка вже використовується по всьому проєкту
    // саме для рендеру картки налаштувань каналу.
    return renderChannelSettings(bot, chatId, messageId, channel, user);
};

// --- Джерела каналу (адмін-перегляд) ---

const handleChannelSourcesView = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const chId = data.replace('admin_ch_sources_', '');
    const channel = await Channel.findById(chId);

    if (!channel) {
        return bot.answerCallbackQuery(query.id, { text: '❌ Канал не знайдено' });
    }

    return bot.editMessageText(
        `📂 <b>Керування Telegram-джерелами</b>\n\nВиберіть джерело для видалення або додайте нове.`,
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getChannelSourcesKeyboard(chId, channel.tgSources)
        }
    );
};

const handleSourceDelete = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    // формат: admin_src_del_tg_CHID_INDEX
    const parts = data.split('_');
    const chId = parts[4];
    const idx = parseInt(parts[5]);

    const channel = await Channel.findById(chId);

    if (channel && channel.tgSources) {
        channel.tgSources.splice(idx, 1);
        await channel.save();
        await bot.answerCallbackQuery(query.id, { text: '✅ Джерело видалено' });

        return bot.editMessageText(`📂 <b>Керування джерелами каналу</b>`, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getChannelSourcesKeyboard(chId, channel.tgSources)
        });
    }

    return bot.answerCallbackQuery(query.id, { text: '❌ Помилка: канал або джерело не знайдено' });
};

const handleSourceView = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const { data } = query;

    const [, , , , chId, index] = data.split('_');
    const channel = await Channel.findById(chId);
    const src = channel.tgSources[parseInt(index)];

    const text = `📢 <b>Деталі TG джерела:</b>\n\n` +
        `<b>Канал:</b> <code>${src.url}</code>\n` +
        `<b>Тип:</b> Telegram донор`;

    return bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getSourceConfirmKeyboard(chId, 'tg', index)
    });
};

module.exports = {
    handleChannelsList,
    handleChannelView,
    handleChannelDelete,
    handleChannelToggle,
    handleChannelSourcesView,
    handleSourceDelete,
    handleSourceView
};