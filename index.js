// index.js
require('dotenv').config();
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const User = require('./models/User');
const Channel = require('./models/Channel');
const Payment = require('./models/Payment');
const Plan = require('./models/Plan');
const { processNews } = require('./services/postService');
const { setupBotCommands } = require('./bot/index');
const { checkSubscriptions, activateChannelsOnUpgrade } = require('./services/subscriptionService');
const { initDefaultPlans } = require('./services/planService');
const { initTgClient } = require('./services/tgParserService');
const { showTimeSelection, showPinSelection } = require('./bot/callbacks/channel_modules/scheduledPosts.js');
const { initScheduledPostsScheduler } = require('./scheduler/index.js');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
setupBotCommands(bot);
initScheduledPostsScheduler(bot);

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('✅ Успішно підключено до MongoDB');
        await initDefaultPlans();
        await initTgClient();
        console.log('📱 Telegram Client ініціалізовано');
    })
    .catch(err => console.error('❌ Помилка підключення до MongoDB:', err));

// ─── CRON ─────────────────────────────────────────────────────────────────────

// Перевірка підписок — щодня о 10:00
cron.schedule('0 10 * * *', async () => {
    await checkSubscriptions(bot).catch(err =>
        console.error('Sub Cron Error:', err.message)
    );
});

// Перевірка новин — кожну хвилину
cron.schedule('* * * * *', async () => {
    await processNews(bot).catch(err =>
        console.error('News Cron Error:', err.message)
    );
});

// Скидання денних лімітів — щодня о 00:00
// Об'єднано: юзери + канали в одному кроні
cron.schedule('0 0 * * *', async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
        // Скидаємо лічильники юзерів (тільки тих, де дата не сьогодні)
        const usersResult = await User.updateMany(
            { 'dailyPostStats.date': { $ne: today } },
            { $set: { 'dailyPostStats.count': 0, 'dailyPostStats.date': today } }
        );
        console.log(`✅ Ліміти юзерів скинуто для ${usersResult.modifiedCount} користувачів.`);

        // Скидаємо лічильник постів для всіх каналів
        const channelsResult = await Channel.updateMany(
            {},
            { $set: { todayPostCount: 0 } }
        );
        console.log(`✅ Лічильники каналів скинуто для ${channelsResult.modifiedCount} каналів.`);
    } catch (err) {
        console.error('❌ Помилка скидання лімітів:', err.message);
    }
});

// ─── ПЛАТЕЖІ ──────────────────────────────────────────────────────────────────

// Pre-checkout: підтверджуємо будь-який запит
bot.on('pre_checkout_query', async (query) => {
    await bot.answerPreCheckoutQuery(query.id, true)
        .catch(err => console.error('PreCheckout Error:', err.message));
});

// Успішна оплата
bot.on('successful_payment', async (msg) => {
    const chatId = msg.chat.id;
    const payment = msg.successful_payment;
    const payload = payment.invoice_payload;

    try {
        // payload формат: plan_payment_<planName>_<chatId>
        const planName = payload.split('_')[2];

        const user = await User.findOne({ telegramId: chatId.toString() });
        const planData = await Plan.findOne({ name: planName });

        if (!user || !planData) {
            console.error('❌ Юзера або план не знайдено');
            return;
        }

        const now = Date.now();
        const DURATION = 30 * 24 * 60 * 60 * 1000;

        // Якщо продовжує той самий тариф — додаємо до поточного кінця
        let newExpiration;
        if (
            user.subscription.plan === planName &&
            user.subscription.expiresAt &&
            user.subscription.expiresAt > new Date(now)
        ) {
            newExpiration = new Date(user.subscription.expiresAt.getTime() + DURATION);
        } else {
            newExpiration = new Date(now + DURATION);
        }

        await User.findOneAndUpdate(
            { telegramId: chatId.toString() },
            {
                $set: {
                    'subscription.plan': planName,
                    'subscription.expiresAt': newExpiration,
                    'subscription.maxChannels': planData.maxChannels,
                    'subscription.maxPostsPerDay': planData.maxPostsPerDay,
                    'subscription.hasCustomPrompt': planData.hasCustomPrompt,
                    'subscription.expiryReminderSent': false
                }
            },
            { new: true }
        );

        await Payment.create({
            userId: user._id,
            telegramId: chatId.toString(),
            plan: planName,
            amount: payment.total_amount,
            payload,
            chargeId: payment.telegram_payment_charge_id,
            status: 'completed'
        });

        const freshUser = await User.findOne({ telegramId: chatId.toString() });
        const activated = await activateChannelsOnUpgrade(freshUser);

        const dateStr = newExpiration.toLocaleDateString('uk-UA');
        const timeStr = newExpiration.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

        await bot.sendMessage(
            chatId,
            `✅ <b>Тариф ${planName.toUpperCase()} активовано!</b>\n\n` +
            `📅 Діє до: <b>${dateStr}</b> о <b>${timeStr}</b>\n` +
            `📺 Активовано каналів: <b>${activated}</b>\n\n` +
            `🚀 Всі проєкти в межах ліміту вже працюють!`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📺 Мої канали', callback_data: 'list_channels' }],
                        [{ text: '🏠 Головне меню', callback_data: 'main_menu' }]
                    ]
                }
            }
        );

    } catch (error) {
        console.error('❌ Критична помилка оплати:', error.message);
        await bot.sendMessage(chatId, '⚠️ Помилка при оновленні підписки. Зверніться до адміна.');
    }
});

// ─── КОМАНДИ ──────────────────────────────────────────────────────────────────

// Команда примусової перевірки
bot.onText(/\/run_now/, async (msg) => {
    bot.sendMessage(msg.chat.id, '⏳ Запуск перевірки новин...');
    await processNews(bot)
        .then(() => bot.sendMessage(msg.chat.id, '✅ Готово!'))
        .catch(err => bot.sendMessage(msg.chat.id, '❌ Помилка: ' + err.message));
});

// ─── ПОВІДОМЛЕННЯ (стейт-машина) ──────────────────────────────────────────────

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // Ігноруємо не-текстові повідомлення без стейту
    const user = await User.findOne({ telegramId: chatId.toString() });
    if (!user || !user.tempState) return;

    // ─── Крок 1: контент для запланованого поста ──────────────────────────────
    if (user.tempState === 'SCHED_STEP_1_CONTENT') {
        const td = user.tempData || {};
        const sp = td.schedPost || {};

        if (msg.photo) {
            sp.mediaType = 'photo';
            sp.mediaFileId = msg.photo[msg.photo.length - 1].file_id;
            sp.text = msg.caption || null;
        } else if (msg.video) {
            sp.mediaType = 'video';
            sp.mediaFileId = msg.video.file_id;
            sp.text = msg.caption || null;
        } else if (msg.text) {
            sp.mediaType = null;
            sp.text = msg.text;
        } else {
            return bot.sendMessage(chatId, '❌ Будь ласка, надішліть текст, фото або відео.');
        }

        await User.findOneAndUpdate(
            { telegramId: chatId.toString() },
            { tempState: 'SCHED_STEP_2_TIME', $set: { 'tempData.schedPost': sp } }
        );

        try { await bot.deleteMessage(chatId, msg.message_id); } catch (e) { }

        return showTimeSelection(bot, chatId, td.instructionMessageId, td.targetChannelId);
    }

    // ─── Крок 2: ручне введення часу ──────────────────────────────────────────
    if (user.tempState === 'SCHED_WAITING_TIME') {
        const text = msg.text;
        const td = user.tempData || {};
        const sp = td.schedPost || {};

        const match = text.match(/^(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})$/);
        if (!match) {
            return bot.sendMessage(chatId, '❌ Невірний формат. Спробуйте ще раз (напр. 25.06 14:30):');
        }

        const [, day, month, hours, minutes] = match;
        const currentYear = new Date().getFullYear();
        const scheduledDate = new Date(`${currentYear}-${month}-${day}T${hours}:${minutes}:00`);

        if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
            return bot.sendMessage(chatId, '❌ Час вказано в минулому або дата не існує. Спробуйте ще раз:');
        }

        sp.scheduledAt = scheduledDate;

        await User.findOneAndUpdate(
            { telegramId: chatId.toString() },
            { tempState: 'SCHED_STEP_3_PIN', $set: { 'tempData.schedPost': sp } }
        );

        try { await bot.deleteMessage(chatId, msg.message_id); } catch (e) { }

        return showPinSelection(bot, chatId, td.instructionMessageId, td.targetChannelId);
    }
});

console.log('🚀 Бот запущений та готовий до роботи!');