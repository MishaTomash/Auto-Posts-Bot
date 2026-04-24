require('dotenv').config();
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

// Моделі та сервіси
const User = require('./models/User'); // Обов'язково додаємо імпорт тут!
const Payment = require('./models/Payment');
const PLANS = require('./config/plans');
const { processNews } = require('./services/postService');
const { setupBotCommands } = require('./bot/index');
const { checkSubscriptions } = require('./services/subscriptionService');
const { initDefaultPlans } = require('./services/planService');
const Plan = require('./models/Plan');

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

// --- ПЛАНУВАЛЬНИК (CRON) ---

// 1. Перевірка закінчення терміну підписок (щогодини)
cron.schedule('0 * * * *', async () => {
    console.log('🕒 Запуск планової перевірки термінів підписок...');
    await checkSubscriptions(bot).catch(err => console.error('Subscription Cron Error:', err.message));
});

// 2. Перевірка новин (щохвилини)
cron.schedule('* * * * *', async () => {
    await processNews(bot).catch(err => console.error('News Cron Error:', err.message));
});

// 3. Нічне скидання лімітів постів (о 00:05)
cron.schedule('5 0 * * *', async () => {
    const today = new Date().toISOString().split('T')[0];
    console.log(`🕒 [CRON] Нічне скидання лімітів на дату: ${today}`);

    try {
        const result = await User.updateMany(
            { "dailyPostStats.date": { $ne: today } },
            {
                $set: {
                    "dailyPostStats.count": 0,
                    "dailyPostStats.date": today
                }
            }
        );
        console.log(`✅ [CRON] Ліміти оновлено для ${result.modifiedCount} користувачів.`);
    } catch (err) {
        console.error('❌ [CRON] Помилка скидання:', err.message);
    }
});

// --- ПЛАТЕЖІ (TELEGRAM STARS) ---

// 1. ПІДТВЕРДЖЕННЯ (Pre-Checkout)
bot.on('pre_checkout_query', async (query) => {
    await bot.answerPreCheckoutQuery(query.id, true).catch(err =>
        console.error("PreCheckout Error:", err.message)
    );
});

// 2. ОБРОБКА УСПІШНОЇ ОПЛАТИ (Successful Payment)
bot.on('successful_payment', async (msg) => {
    const chatId = msg.chat.id;
    const payment = msg.successful_payment;
    const payload = payment.invoice_payload;

    const User = require('./models/User');
    const Plan = require('./models/Plan');
    const Payment = require('./models/Payment');

    try {
        const parts = payload.split('_');
        const planName = parts[2];

        const user = await User.findOne({ telegramId: chatId.toString() });
        const planData = await Plan.findOne({ name: planName });

        if (!user || !planData) {
            console.error("❌ Юзера або план не знайдено в БД");
            return;
        }

        // ЛОГІКА ДАТИ (Продовження)
        const now = Date.now();
        const duration = 30 * 24 * 60 * 60 * 1000;
        let newExpiration;

        if (user.subscription.plan === planName && user.subscription.expiresAt > new Date(now)) {
            newExpiration = new Date(user.subscription.expiresAt.getTime() + duration);
        } else {
            newExpiration = new Date(now + duration);
        }

        // ОНОВЛЮЄМО ЮЗЕРА
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
            }
        );

        // ФІКСУЄМО ПЛАТІЖ
        await Payment.create({
            userId: user._id,
            telegramId: chatId.toString(),
            plan: planName,
            amount: payment.total_amount,
            payload: payload,
            chargeId: payment.telegram_payment_charge_id,
            status: 'completed'
        });

        const dateStr = newExpiration.toLocaleDateString('uk-UA');
        const timeStr = newExpiration.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

        // Формуємо ОДНЕ повідомлення з кнопками
        const successKeyboard = {
            inline_keyboard: [
                [{ text: "📺 Мої канали", callback_data: "list_channels" }],
                [{ text: "🏠 Головне меню", callback_data: "main_menu" }]
            ]
        };

        await bot.sendMessage(chatId,
            `✅ <b>Тариф активовано/продовжено!</b>\n\n` +
            `Ваш план: <b>${planName.toUpperCase()}</b>\n` +
            `Діє до: <b>${dateStr}</b> о <b>${timeStr}</b>\n\n` +
            `🚀 Всі ліміти оновлено. Тепер ви можете підключити до ${planData.maxChannels} каналів та налаштувати власні AI промпти!`,
            {
                parse_mode: 'HTML',
                reply_markup: successKeyboard
            }
        );

    } catch (error) {
        console.error("❌ Критична помилка успішної оплати:", error.message);
        await bot.sendMessage(chatId, "⚠️ Сталася помилка при оновленні підписки. Зверніться до адміна.");
    }
});
// Команда примусової перевірки
bot.onText(/\/run_now/, async (msg) => {
    bot.sendMessage(msg.chat.id, "⏳ Запуск перевірки новин...");
    await processNews(bot).then(() => bot.sendMessage(msg.chat.id, "✅ Готово!")).catch(err => bot.sendMessage(msg.chat.id, "❌ Помилка: " + err.message));
});

console.log('🚀 Бот запущений та готовий до роботи!');