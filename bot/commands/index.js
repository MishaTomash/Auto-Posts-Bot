bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const today = new Date().toISOString().split('T')[0];

    const mainAdminId = String(process.env.ADMIN_TELEGRAM_ID || '').trim();
    const isMainAdmin = chatId.toString().trim() === mainAdminId;

    const updateData = {
        username: msg.from.username || 'Користувач',
        tempState: null,
        tempData: {},
    };

    // Якщо це головний адмін, примусово оновлюємо йому роль
    if (isMainAdmin) {
        updateData.role = 'admin';
    }

    await User.findOneAndUpdate(
        { telegramId: chatId.toString() },
        {
            $set: updateData,
            $setOnInsert: {
                subscription: {
                    plan: 'free',
                    maxChannels: 1,
                    maxPostsPerDay: 5,
                    canCustomPrompt: false
                }
            }
        },
        { upsert: true, new: true }
    );
    await bot.deleteMessage(chatId, msg.message_id).catch(() => { });
    await sendMainMenu(chatId);
});