// index.js
require('dotenv').config();
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const User = require('./models/User');
const Payment = require('./models/Payment');
const Plan = require('./models/Plan');
const { processNews } = require('./services/postService');
const { setupBotCommands } = require('./bot/index');
const { checkSubscriptions, activateChannelsOnUpgrade } = require('./services/subscriptionService');
const { initDefaultPlans } = require('./services/planService');
const { initTgClient } = require('./services/tgParserService');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
setupBotCommands(bot);

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('✅ Успішно підключено до MongoDB');
        await initDefaultPlans();
        await initTgClient();
        console.log('📱 Telegram Client ініціалізовано');
    })
    .catch(err => console.error('❌ Помилка підключення до MongoDB:', err));

// ─── CRON ─────────────────────────────────────────────────────────────────────

// Перевірка підписок — кожну хвилину (потрібно для 5-хвилинного тесту; на проді: '0 * * * *')
cron.schedule('* * * * *', async () => {
    await checkSubscriptions(bot).catch(err => console.error('Sub Cron Error:', err.message));
});

// Перевірка новин — кожну хвилину
cron.schedule('* * * * *', async () => {
    await processNews(bot).catch(err => console.error('News Cron Error:', err.message));
});

// Скидання денних лімітів — 00:05
cron.schedule('5 0 * * *', async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
        const result = await User.updateMany(
            { 'dailyPostStats.date': { $ne: today } },
            { $set: { 'dailyPostStats.count': 0, 'dailyPostStats.date': today } }
        );
        console.log(`✅ Ліміти скинуто для ${result.modifiedCount} користувачів.`);
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

        // Логіка дати: якщо продовжує той самий тариф — додаємо до поточного кінця
        const now = Date.now();
        const DURATION = 5 * 60 * 1000; // 5 хвилин (на проді: 30 * 24 * 60 * 60 * 1000)

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

        // Оновлюємо підписку
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

        // Фіксуємо платіж
        await Payment.create({
            userId: user._id,
            telegramId: chatId.toString(),
            plan: planName,
            amount: payment.total_amount,
            payload,
            chargeId: payment.telegram_payment_charge_id,
            status: 'completed'
        });

        // Активуємо канали в межах ліміту нового тарифу
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

// Команда примусової перевірки
bot.onText(/\/run_now/, async (msg) => {
    bot.sendMessage(msg.chat.id, '⏳ Запуск перевірки новин...');
    await processNews(bot)
        .then(() => bot.sendMessage(msg.chat.id, '✅ Готово!'))
        .catch(err => bot.sendMessage(msg.chat.id, '❌ Помилка: ' + err.message));
});

console.log('🚀 Бот запущений та готовий до роботи!');