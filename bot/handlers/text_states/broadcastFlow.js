// bot/handlers/text_states/broadcastFlow.js
// Текстова частина флоу розсилки: підтвердження після ADMIN_AWAITING_BROADCAST.
//
// NOTE: оригінальний index.js також містив блоки для станів WAITING_BC_TEXT,
// WAITING_BC_BUTTON та WAITING_BC_CONFIRM. Жоден файл проєкту ніколи не
// встановлює tempState у ці значення (admin.js переводить адміна одразу в
// ADMIN_AWAITING_BROADCAST, який після першого повідомлення одразу веде в
// CONFIRM_BROADCAST). Це був недосяжний код зі старої версії флоу розсилки —
// прибраний. Якщо потрібно повернути режим "превʼю + кнопка-посилання" для
// розсилки, його треба підключити окремо (немає callback/стану, що в нього веде).

const User = require('../../../models/User');

// Цей блок викликається з handlers/index.js ДО входу в загальний switch по
// tempState, тому що ADMIN_AWAITING_BROADCAST в оригіналі мав свою гілку поза
// основним try { } — переносимо без змін поведінки.
const handleAwaitingBroadcast = async (bot, chatId, text, msg) => {
    // Якщо адмін прислав команду (наприклад /start), то розсилку не робимо
    if (text.startsWith('/')) return true; // true = "оброблено, виходимо"

    const messageIdToCopy = msg.message_id;

    await User.findOneAndUpdate(
        { telegramId: chatId.toString() },
        {
            tempState: 'CONFIRM_BROADCAST',
            tempData: {
                broadcastMsgId: messageIdToCopy,
                broadcastFromChatId: chatId
            }
        }
    );

    await bot.sendMessage(chatId, "☝️ <b>Прев'ю розсилки вище.</b>\n\nВідправити це повідомлення всім?", {
        parse_mode: 'HTML',
        reply_to_message_id: messageIdToCopy,
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ Так, розіслати', callback_data: 'admin_bc_start_final' }],
                [{ text: '❌ Скасувати', callback_data: 'admin_dashboard' }]
            ]
        }
    });

    return true;
};

module.exports = { handleAwaitingBroadcast };