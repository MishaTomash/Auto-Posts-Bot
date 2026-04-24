const User = require('../models/User');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const startBroadcast = async (bot, adminChatId, { text, target, button }) => {
    let query = {};
    if (target === 'free') query = { 'subscription.plan': 'free' };
    else if (target === 'paid') query = { 'subscription.plan': { $ne: 'free' } };

    const users = await User.find(query).select('telegramId');
    const total = users.length;
    let success = 0;
    let errors = 0;

    await bot.sendMessage(adminChatId, `🚀 Розсилка розпочата для ${total} користувачів...`);

    const progressMsg = await bot.sendMessage(adminChatId, `⏳ Прогрес: 0/${total}`);

    for (let i = 0; i < users.length; i++) {
        try {
            const options = { parse_mode: 'HTML' };
            if (button) {
                options.reply_markup = {
                    inline_keyboard: [[{ text: button.text, url: button.url }]]
                };
            }

            await bot.sendMessage(users[i].telegramId, text, options);
            success++;
        } catch (error) {
            errors++;
            // Якщо користувач заблокував бота — можна помітити це в БД
            if (error.response && error.response.statusCode === 403) {
                await User.updateOne({ telegramId: users[i].telegramId }, { isBlockedByBot: true });
            }
        }

        // Оновлюємо статус кожні 50 повідомлень
        if (i % 50 === 0 && i !== 0) {
            await bot.editMessageText(`⏳ Прогрес: ${i}/${total}`, {
                chat_id: adminChatId,
                message_id: progressMsg.message_id
            });
        }

        // Крок Е4: Затримка 35мс між повідомленнями (~28-30 msg/sec)
        await sleep(35);
    }

    // Крок Е5: Звіт
    const report = `
✅ <b>Розсилка завершена!</b>
👥 Всього: ${total}
📥 Отримали: ${success}
❌ Помилки: ${errors} (блокування/видалення)
    `;
    
    await bot.sendMessage(adminChatId, report, { parse_mode: 'HTML' });
};

module.exports = { startBroadcast };