// bot/callbacks/wizard.js

const User = require('../../models/User');
const Channel = require('../../models/Channel');

const wizardHandler = async (bot, query, user) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;

    if (data === 'start_wizard') {
        try {
            // 1. Перевірка лімітів за кількістю каналів
            const userChannelsCount = await Channel.countDocuments({ userId: user._id });

            if (userChannelsCount >= user.subscription.maxChannels) {
                return bot.editMessageText(
                    `⚠️ <b>Ліміт вичерпано</b>\n\n` +
                    `Ви досягли ліміту вашого тарифу <b>${user.subscription.plan.toUpperCase()}</b>: ` +
                    `максимум ${user.subscription.maxChannels} канал(ів).`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '👤 Мій профіль', callback_data: 'my_profile' }],
                                [{ text: '🏠 Меню', callback_data: 'main_menu' }]
                            ]
                        }
                    }
                );
            }

            // 2. Встановлюємо стан очікування назви
            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                { 
                    tempState: 'STEP_1_NAME', 
                    lastMenuMessageId: messageId, 
                    tempData: {} 
                }
            );

            const text =
                `🚀 **Створення нового проєкту**\n` +
                `________________________________\n\n` +
                `📝 **Крок 1 з 2: Дайте назву**\n\n` +
                `👇 **Введіть назву прямо зараз:**`;

            return bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Скасувати', callback_data: 'main_menu' }]]
                }
            });

        } catch (error) {
            console.error("❌ Wizard Error:", error.message);
        }
    }
};

module.exports = wizardHandler; 