// bot/handlers/text_states/sourceAndInterval.js
// Текстові кроки: додавання TG-джерела (WAITING_TG_SOURCE) та ручне введення
// інтервалу перевірки (WAITING_MANUAL_INTERVAL).
//
// NOTE: оригінальний файл мав ще один блок для стану 'WAITING_FOR_TG_SOURCE'
// (без префіксу user.tempState, з трохи іншою логікою валідації). Жоден
// callback-файл проєкту не встановлює tempState у це значення — це мертвий
// код від старішої версії того ж функціоналу. Робочий шлях додавання джерела —
// channels.js -> add_tgsrc_* -> tempState: 'WAITING_TG_SOURCE' (без 'FOR_'),
// який і залишений нижче.

const User = require('../../../models/User');
const Channel = require('../../../models/Channel');
const { renderSourcesList, renderChannelSettings } = require('../../callbacks/ui_renderers');

const handleWaitingTgSource = async (bot, chatId, msg, user) => {
    const targetChannelId = user.tempData.targetChannelId;
    const sourceUrl = (msg.text || '').trim();

    // Видаляємо повідомлення користувача (його посилання), щоб було чисто
    await bot.deleteMessage(chatId, msg.message_id).catch(() => {});

    if (!sourceUrl.includes('t.me/') && !sourceUrl.startsWith('@')) {
        const errorMsg = await bot.sendMessage(chatId, '❌ Це не посилання. Спробуйте ще раз.');
        setTimeout(() => bot.deleteMessage(chatId, errorMsg.message_id).catch(() => {}), 3000);
        return;
    }

    await Channel.findByIdAndUpdate(targetChannelId, {
        $push: { tgSources: { url: sourceUrl, lastMessageId: 0 } }
    });

    if (user.tempData.instructionMessageId) {
        await bot.deleteMessage(chatId, user.tempData.instructionMessageId).catch(() => {});
    }

    await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: null, tempData: {} });

    await renderSourcesList(bot, chatId, user.tempData.instructionMessageId, targetChannelId);

    const successMsg = await bot.sendMessage(chatId, '✅ Джерело додано успішно!');
    setTimeout(() => {
        bot.deleteMessage(chatId, successMsg.message_id).catch(() => {});
    }, 3000);
};

const handleManualInterval = async (bot, chatId, msg, text, user) => {
    const minutes = parseInt(text);
    const chId = user.tempData.targetChannelId;
    const instructionMessageId = user.tempData.instructionMessageId;

    await bot.deleteMessage(chatId, msg.message_id).catch(() => {});

    if (isNaN(minutes) || minutes < 1) {
        const errorMsg = await bot.sendMessage(chatId, '❌ Введіть число більше 0');
        setTimeout(() => bot.deleteMessage(chatId, errorMsg.message_id).catch(() => {}), 3000);
        return;
    }

    const updatedCh = await Channel.findByIdAndUpdate(chId, {
        checkInterval: minutes,
        scheduleMode: 'interval'
    }, { new: true });

    await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: null, tempData: {} });

    try {
        await renderChannelSettings(bot, chatId, instructionMessageId, updatedCh, user);
    } catch (err) {
        console.error('Все ще помилка імпорту:', err.message);
        await bot.sendMessage(chatId, '✅ Збережено! Поверніться в меню.');
    }

    const successMsg = await bot.sendMessage(chatId, `✅ Інтервал: ${minutes} хв.`);
    setTimeout(() => bot.deleteMessage(chatId, successMsg.message_id).catch(() => {}), 3000);
};

module.exports = { handleWaitingTgSource, handleManualInterval };