// bot/handlers/text_states/wizardSteps.js
// Кроки майстра створення проєкту: STEP_1_NAME -> STEP_2_ID.

const User = require('../../../models/User');
const Channel = require('../../../models/Channel');

const handleStep1Name = async (bot, chatId, text, menuId) => {
    await User.updateOne(
        { telegramId: chatId.toString() },
        {
            $set: {
                tempState: 'STEP_2_ID',
                'tempData.name': text
            }
        }
    );

    const response =
        `✅ **Назву "${text}" прийнято!**\n` +
        `________________________________\n\n` +
        `🔗 **Крок 2 з 2: Підключення каналу**\n\n` +
        `Куди бот має публікувати готові новини?\n\n` +
        `**Надішліть одним повідомленням:**\n` +
        `• Посилання (напр. \`t.me/my_channel\`)\n` +
        `• Або Username (напр. \`@my_channel\`)\n` +
        `• Або числовий ID (напр. \`-100...\`)`;

    return bot.editMessageText(response, {
        chat_id: chatId,
        message_id: menuId,
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'start_wizard' }]]
        }
    });
};

const handleStep2Id = async (bot, chatId, text, menuId) => {
    let channelIdInput = text.trim();

    // Чистимо посилання
    if (channelIdInput.includes('t.me/')) {
        channelIdInput = '@' + channelIdInput.split('t.me/')[1].split('/')[0].replace('@', '');
    }
    if (!channelIdInput.startsWith('@') && !channelIdInput.startsWith('-100') && isNaN(channelIdInput)) {
        channelIdInput = '@' + channelIdInput;
    }

    try {
        const freshUser = await User.findOne({ telegramId: chatId.toString() }).lean();
        const projectName = freshUser.tempData?.name || 'Мій проєкт';

        const channelData = {
            userId: freshUser._id,
            channelUsername: projectName,
            channelId: channelIdInput,
            isActive: false,
            aiPrompt: null,
            tgSources: [],
        };

        const saved = await new Channel(channelData).save();

        await User.updateOne(
            { telegramId: chatId.toString() },
            { $set: { tempState: null, tempData: {} } }
        );

        const successText =
            `✨ **Проєкт успішно створено!**\n` +
            `________________________________\n\n` +
            `📁 Проєкт: **${projectName}**\n` +
            `📢 Канал: \`${channelIdInput}\`\n\n` +
            `💡 Тепер налаштуйте джерела новин у меню керування.`;

        return bot.editMessageText(successText, {
            chat_id: chatId,
            message_id: menuId,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⚙️ Керувати проєктом', callback_data: `manage_${saved._id}` }],
                    [{ text: '🏠 Головне меню', callback_data: 'main_menu' }]
                ]
            }
        });

    } catch (err) {
        console.error('Create Error:', err);
        return bot.sendMessage(chatId, '❌ Помилка: можливо цей канал вже додано.');
    }
};

module.exports = { handleStep1Name, handleStep2Id };