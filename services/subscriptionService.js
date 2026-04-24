const User = require('../models/User');
const cron = require('node-cron');
const Channel = require('../models/Channel');

const checkSubscriptions = async (bot) => {
    // Запускаємо щодня о 10:00
        console.log('--- Running daily subscription check ---');
        
        const now = new Date();
        const threeDaysLater = new Date();
        threeDaysLater.setDate(now.getDate() + 3);

        // 1. Нагадування за 3 дні
        const usersToRemind = await User.find({
            'subscription.plan': { $ne: 'free' },
            'subscription.endDate': { 
                $gte: new Date(threeDaysLater.setHours(0,0,0,0)), 
                $lte: new Date(threeDaysLater.setHours(23,59,59,999)) 
            },
            'subscription.remindedThreeDays': { $ne: true }
        });

        for (const user of usersToRemind) {
            try {
                const dateStr = user.subscription.endDate.toLocaleDateString('uk-UA');
                await bot.sendMessage(user.telegramId, 
                    `⏰ Ваша підписка *${user.subscription.plan.toUpperCase()}* закінчується через 3 дні (${dateStr}).\n\nЩоб продовжити та не втратити доступ до налаштувань — натисніть кнопку нижче.`, 
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '💳 Продовжити підписку', callback_data: 'buy_subscription' }
                            ]]
                        }
                    }
                );
                user.subscription.remindedThreeDays = true;
                await user.save();
            } catch (err) {
                console.error(`Failed to remind user ${user.telegramId}:`, err);
            }
        }

        // 2. Закінчення підписки сьогодні
        const expiredUsers = await User.find({
            'subscription.plan': { $ne: 'free' },
            'subscription.endDate': { $lt: now }
        });

        for (const user of expiredUsers) {
            try {
                await bot.sendMessage(user.telegramId, 
                    `❌ Термін дії вашої підписки *${user.subscription.plan.toUpperCase()}* закінчився. \n\nВаш тариф змінено на *Free*. Деякі канали могли стати неактивними через ліміти.`,
                    { parse_mode: 'Markdown' }
                );

                // Скидаємо до Free
                user.subscription.plan = 'free';
                user.subscription.endDate = null; // Або дуже далека дата
                user.subscription.remindedThreeDays = false;
                
                // Додаткова логіка: вимикаємо канали, що перевищують ліміт 1
                // Це можна реалізувати в окремому методі Channel.updateMany...
                
                await user.save();
            } catch (err) {
                console.error(`Failed to process expired sub for ${user.telegramId}:`, err);
            }
        }
    
};

async function activateChannelsOnUpgrade(user) {
    try {
        const maxAllowed = user.subscription.maxChannels;
        
        // Знаходимо всі канали користувача (і активні, і неактивні)
        const userChannels = await Channel.find({ userId: user._id }).sort({ createdAt: 1 });

        let activatedCount = 0;

        for (let i = 0; i < userChannels.length; i++) {
            const channel = userChannels[i];
            
            // Якщо ми ще в межах ліміту нового тарифу
            if (i < maxAllowed) {
                if (!channel.isActive) {
                    channel.isActive = true;
                    await channel.save();
                    activatedCount++;
                }
            } else {
                // Якщо каналів більше, ніж дозволяє навіть новий тариф — вимикаємо решту
                if (channel.isActive) {
                    channel.isActive = false;
                    await channel.save();
                }
            }
        }
        
        return activatedCount;
    } catch (err) {
        console.error("❌ Помилка при активації каналів:", err.message);
        return 0;
    }
}

module.exports = { checkSubscriptions, activateChannelsOnUpgrade };