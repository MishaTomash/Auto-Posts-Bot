// bot/callbacks/renderers/channelSettingsRenderer.js
// Рендер картки налаштувань каналу (статус, інтервал, AI промпт, остання перевірка).

const { getChannelSettingsKeyboard } = require('../../keyboards/channel');

const renderChannelSettings = async (bot, chatId, messageId, channel, user) => {
    const tgCount = channel.tgSources?.length || 0;

    // 1. СТАТУС РОБОТИ (Активний/Пауза)
    const statusIcon = channel.isActive ? '🟢' : '🔴';
    const statusText = channel.isActive ? 'ПРАЦЮЄ' : 'ЗУПИНЕНО';
    const statusDesc = channel.isActive
        ? 'Бот моніторить джерела та публікує новини.'
        : 'Бот ігнорує нові пости, поки ви його не запустите.';

    // 2. СТАТУС AI ПРОМПТУ
    const isCustom = channel.aiPrompt !== null && channel.aiPrompt !== undefined;
    const aiStatus = isCustom ? '🟡 Кастомний' : '🟢 Стандартний';

    // 3. ОСТАННЯ ПЕРЕВІРКА
    const lastCheckDate = channel.lastCheckAt;
    const isNeverChecked = !lastCheckDate || lastCheckDate.getTime() === 0;
    const lastCheckStr = isNeverChecked ? 'Ще не було' : lastCheckDate.toLocaleString('uk-UA');

    // 4. ЗАГОЛОВОК (Username каналу)
    const channelTitle = channel.channelUsername || 'Без назви';

    const text = `⚙️ <b>Налаштування:</b> ${channelTitle}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🌐 <b>Канал:</b> <code>${channel.channelId || 'Не підключено'}</code>\n` +
        `📊 <b>Джерела:</b> TG: ${tgCount}\n` +
        `⏱ <b>Інтервал:</b> кожні ${channel.checkInterval} хв.\n` +
        `🤖 <b>AI Промпт:</b> ${aiStatus}\n` +
        `📢 <b>Статус проєкту:</b> ${statusIcon} <b>${statusText}</b>\n` +
        `<i>${statusDesc}</i>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🕒 <i>Остання перевірка: ${lastCheckStr}</i>`;

    return bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: getChannelSettingsKeyboard(channel, user)
        }
    }).catch(err => {
        if (!err.message.includes('message is not modified')) console.error(err);
    });
};

module.exports = { renderChannelSettings };