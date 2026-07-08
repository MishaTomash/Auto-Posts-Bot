// bot/callbacks/renderers/channelSettingsRenderer.js
// Рендер картки налаштувань каналу (статус, інтервал, AI промпт, остання перевірка).

const { getChannelSettingsKeyboard } = require('../../keyboards/channel');

const renderChannelSettings = async (bot, chatId, messageId, channel, user) => {
    const tgCount = channel.tgSources?.length || 0;

    const statusIcon = channel.isActive ? '🟢' : '🔴';
    const statusText = channel.isActive ? 'ПРАЦЮЄ' : 'ЗУПИНЕНО';
    const statusDesc = channel.isActive
        ? 'Бот моніторить джерела та публікує новини.'
        : 'Бот ігнорує нові пости, поки ви його не запустите.';

    const isCustom = channel.aiPrompt !== null && channel.aiPrompt !== undefined;
    const aiStatus = isCustom ? '🟡 Кастомний' : '🟢 Стандартний';

    const lastCheckDate = channel.lastCheckAt;
    const isNeverChecked = !lastCheckDate || lastCheckDate.getTime() === 0;
    const lastCheckStr = isNeverChecked ? 'Ще не було' : lastCheckDate.toLocaleString('uk-UA');

    const channelTitle = channel.channelUsername || 'Без назви';

    // Ліміт постів
    const limit = channel.dailyPostLimit || 10;
    const used  = channel.todayPostCount  || 0;
    const remaining = Math.max(0, limit - used);
    const totalBlocks = 8;
    const filledBlocks = Math.round((used / limit) * totalBlocks);
    const bar = '█'.repeat(filledBlocks) + '░'.repeat(totalBlocks - filledBlocks);

    const text =
        `⚙️ <b>Налаштування:</b> ${channelTitle}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🌐 <b>Канал:</b> <code>${channel.channelId || 'Не підключено'}</code>\n` +
        `📊 <b>Джерела:</b> TG: ${tgCount}\n` +
        `⏱ <b>Інтервал перевірки:</b> кожні ${channel.checkInterval} хв.\n` +
        `📬 <b>Ліміт постів:</b> ${used}/${limit} сьогодні\n` +
        `     ${bar}  залишилось: ${remaining}\n` +
        `🤖 <b>AI Промпт:</b> ${aiStatus}\n` +
        `📢 <b>Статус проєкту:</b> ${statusIcon} <b>${statusText}</b>\n` +
        `<i>${statusDesc}</i>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🕒 <i>Остання перевірка: ${lastCheckStr}</i>`;

    return bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: getChannelSettingsKeyboard(channel, user) }
    }).catch(err => {
        if (!err.message.includes('message is not modified')) console.error(err);
    });
};

module.exports = { renderChannelSettings };