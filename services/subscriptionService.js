// services/subscriptionService.js
const User = require('../models/User');
const Channel = require('../models/Channel');
const Plan = require('../models/Plan');

// ─── Константи часу ───────────────────────────────────────────────────────────
const SUBSCRIPTION_DURATION_MS = 5 * 60 * 1000;   // 5 хвилин (для прод: 30 * 24 * 60 * 60 * 1000)
const REMINDER_BEFORE_MS       = 3 * 60 * 1000;   // Нагадати за 3 хвилини до кінця

// ─── Скинути користувача на FREE ─────────────────────────────────────────────
const downgradeToFree = async (user) => {
    const freePlan = await Plan.findOne({ name: 'free' });

    user.subscription.plan             = 'free';
    user.subscription.expiresAt        = null;
    user.subscription.expiryReminderSent = false;
    user.subscription.maxChannels      = freePlan?.maxChannels      ?? 1;
    user.subscription.maxPostsPerDay   = freePlan?.maxPostsPerDay   ?? 5;
    user.subscription.hasCustomPrompt  = freePlan?.hasCustomPrompt  ?? false;

    await user.save();
};

// ─── Зупинити всі канали користувача ─────────────────────────────────────────
const pauseAllChannels = async (userId) => {
    await Channel.updateMany({ userId }, { $set: { isActive: false } });
};

// ─── Активувати канали в межах ліміту тарифу ─────────────────────────────────
const activateChannelsOnUpgrade = async (user) => {
    const maxAllowed = user.subscription.maxChannels;
    // Беремо канали від найстарішого: перші N стають активними, решта — ні
    const channels = await Channel.find({ userId: user._id }).sort({ createdAt: 1 });

    for (let i = 0; i < channels.length; i++) {
        const shouldBeActive = i < maxAllowed;
        if (channels[i].isActive !== shouldBeActive) {
            channels[i].isActive = shouldBeActive;
            await channels[i].save();
        }
    }

    return channels.filter((_, i) => i < maxAllowed).length;
};

// ─── Перевірка підписок (викликається cron-ом щохвилини) ─────────────────────
const checkSubscriptions = async (bot) => {
    const now = new Date();

    try {
        // 1. НАГАДУВАННЯ (підписка закінчується протягом REMINDER_BEFORE_MS)
        const reminderDeadline = new Date(now.getTime() + REMINDER_BEFORE_MS);

        const usersToRemind = await User.find({
            'subscription.plan': { $ne: 'free' },
            'subscription.expiresAt': { $gt: now, $lte: reminderDeadline },
            'subscription.expiryReminderSent': { $ne: true }
        });

        for (const user of usersToRemind) {
            const msLeft   = user.subscription.expiresAt - now;
            const minLeft  = Math.max(1, Math.round(msLeft / 60000));

            try {
                await bot.sendMessage(
                    user.telegramId,
                    `⏰ <b>Ваш тариф скоро закінчується!</b>\n\n` +
                    `Залишилося приблизно <b>${minLeft} хв.</b>\n\n` +
                    `Після закінчення всі проєкти будуть автоматично поставлені на ⏸ паузу.\n` +
                    `Поновіть підписку, щоб не переривати роботу!`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '💳 Поновити тариф', callback_data: 'subscription_shop' }
                            ]]
                        }
                    }
                );

                user.subscription.expiryReminderSent = true;
                await user.save();
                console.log(`📢 Нагадування надіслано: ${user.telegramId}`);
            } catch (err) {
                console.error(`❌ Не вдалося надіслати нагадування ${user.telegramId}:`, err.message);
            }
        }

        // 2. ДЕАКТИВАЦІЯ (термін підписки вийшов)
        const expiredUsers = await User.find({
            'subscription.plan': { $ne: 'free' },
            'subscription.expiresAt': { $lt: now }
        });

        for (const user of expiredUsers) {
            console.log(`🚫 Підписка закінчилась: ${user.telegramId}`);

            try {
                await pauseAllChannels(user._id);
                await downgradeToFree(user);

                await bot.sendMessage(
                    user.telegramId,
                    `❌ <b>Тариф закінчився!</b>\n\n` +
                    `Всі ваші проєкти поставлено на <b>паузу ⏸</b>.\n\n` +
                    `Щоб продовжити роботу — придбайте будь-який тариф. ` +
                    `Канали в межах ліміту нового плану увімкнуться автоматично.`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '💎 Обрати тариф', callback_data: 'subscription_shop' }
                            ]]
                        }
                    }
                );
            } catch (err) {
                console.error(`❌ Помилка деактивації ${user.telegramId}:`, err.message);
            }
        }
    } catch (err) {
        console.error('❌ Помилка checkSubscriptions:', err.message);
    }
};

module.exports = { checkSubscriptions, activateChannelsOnUpgrade, pauseAllChannels, downgradeToFree };