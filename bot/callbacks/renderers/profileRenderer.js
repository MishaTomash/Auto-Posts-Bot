// bot/callbacks/renderers/profileRenderer.js
// Рендер картки профілю користувача.

const Channel = require('../../../models/Channel');
const Plan = require('../../../models/Plan');

const renderProfile = async (bot, chatId, messageId, user) => {
    try {
        const planData = await Plan.findOne({ name: user.subscription.plan });

        if (planData && planData.hasCustomPrompt !== user.subscription.hasCustomPrompt) {
            user.subscription.hasCustomPrompt = planData.hasCustomPrompt;
            user.subscription.maxChannels = planData.maxChannels;
            user.subscription.maxPostsPerDay = planData.maxPostsPerDay;
            await user.save();
        }

        const sub = user.subscription;
        const userChannelsCount = await Channel.countDocuments({ userId: user._id });
        const stats = user.dailyPostStats || { count: 0 };
        const expiryDate = sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('uk-UA') : '—';
        const aiStatus = sub.hasCustomPrompt ? '✅ Доступно' : '❌ Недоступно';

        const profileText = `<b>👤 Ваш профіль</b>\n\n` +
            `🆔 ID: <code>${user.telegramId}</code>\n` +
            `🏷 Тариф: <b>${sub.plan.toUpperCase()}</b>\n\n` +
            `📊 <b>Ваші ліміти:</b>\n` +
            `📺 Каналів: <b>${userChannelsCount} / ${sub.maxChannels}</b>\n` +
            `📝 Постів сьогодні: <b>${stats.count} / ${sub.maxPostsPerDay}</b>\n` +
            `🤖 AI Промпт: <b>${aiStatus}</b>\n\n` +
            `📅 Підписка: <b>${sub.plan === 'free' ? 'Безстроково' : 'До ' + expiryDate}</b>`;

        const keyboard = {
            inline_keyboard: [
                [{ text: '🚀 Підвищити тариф', callback_data: 'subscription_shop' }],
                [{ text: '🏠 Меню', callback_data: 'main_menu' }]
            ]
        };

        await bot.editMessageText(profileText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: keyboard
        });

    } catch (error) {
        console.error('❌ Помилка рендеру профілю:', error.message);
    }
};

module.exports = { renderProfile };