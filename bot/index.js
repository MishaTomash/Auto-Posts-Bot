// bot/index.js
const User = require('../models/User');
const Channel = require('../models/Channel');
// Тепер це об'єкт, що містить callbackHandler, renderPromptSettings та ін.
const callbacks = require('./callbacks/index');
const handleMessages = require('./handlers/index');
const { mainMenu } = require('./keyboards/main');
const { adminMenu } = require('./keyboards/admin');
const { getChannelSettingsKeyboard } = require('./keyboards/channel');
const Payment = require('../models/Payment'); // Додай це сюди

const setupBotCommands = (bot) => {


    // bot/index.js

    const sendMainMenu = async (chatId, oldMessageId = null) => {
        try {
            const { getMainMenu } = require('./keyboards/main');
            const { isAdmin } = require('./middleware/auth'); // Використовуємо наш надійний middleware

            // Викликаємо перевірку
            const adminStatus = await isAdmin(chatId);

            const text = "📌 Головне меню\n\nОберіть потрібну дію:";
            const keyboard = getMainMenu(adminStatus);

            if (oldMessageId) {
                await bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: oldMessageId,
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                }).catch(() => {
                    return bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
                });
            } else {
                await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
            }
        } catch (err) {
            console.error("Menu Error:", err.message);
        }
    };

    // Функція відображення налаштувань конкретного каналу
async function showChannelSettings(chatId, channelId, messageId = null, user = null) {
    try {
        // Дістаємо чистий ID
        const cleanId = (typeof channelId === 'string' && channelId.includes('_')) 
            ? channelId.split('_').pop() 
            : channelId;

        if (!cleanId || cleanId.length !== 24) return;

        // ШУКАЄМО ТІЛЬКИ В 'channel'
        const channel = await Channel.findById(cleanId);
        
        if (!channel) {
            console.log("❌ Канал не знайдено в БД по ID:", cleanId);
            return;
        }

        // Перевіряємо юзера
        if (!user) {
            user = await User.findOne({ telegramId: chatId.toString() });
        }

        // === DEBUG БЛОК (якщо тут впаде - значить channel реально null) ===
        console.log(`DEBUG: Канал=${channel.channelUsername}, Enabled=${channel.isEnabled}`);

        const projectStatus = channel.isActive ? "🟢 АКТИВНИЙ" : "🔴 НА ПАУЗІ";

        const text = `⚙️ Керування: <b>${channel.channelUsername}</b>\n\n` +
            `📊 Стан проєкту: <b>${projectStatus}</b>\n` +
            `⏱ Інтервал: ${channel.checkInterval} хв\n` +
            `📱 Джерела: TG(${channel.tgSources?.length || 0})  | RSS(${channel.rssUrls.length} | JSON(${channel.jsonSources.length})`;

        const opts = {
            parse_mode: 'HTML',
            reply_markup: {
                // ПЕРЕВІР ТУТ: має бути (channel, user), а не (ch, user)
                inline_keyboard: getChannelSettingsKeyboard(channel, user)
            }
        };

        if (messageId) {
            await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts }).catch(() => {});
        } else {
            await bot.sendMessage(chatId, text, opts);
        }
    } catch (e) {
        // Якщо тут пише "channel is not defined", значить ти десь у коді нижче 
        // написав слово channel, якого немає в цій області видимості
        console.error("🔴 showChannelSettings Error:", e.message);
    }
}
    callbacks.showChannelSettings = showChannelSettings;
    // Команда /start
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;

        await User.findOneAndUpdate(
            { telegramId: chatId.toString() },
            {
                username: msg.from.username,
                firstName: msg.from.first_name,
                lastActiveAt: new Date(),
                // ✅ Скидаємо всі стани щоб старі помилки не впливали
                tempState: null,
                tempData: {}
            },
            { upsert: true }
        );

        // ✅ Видаляємо повідомлення /start щоб не смітило в чаті
        bot.deleteMessage(chatId, msg.message_id).catch(() => { });

        await sendMainMenu(chatId);
    });

    bot.onText(/\/admin/, async (msg) => {
        const chatId = msg.chat.id;

        try {
            const user = await User.findOne({ telegramId: chatId.toString() });

            if (!user || user.role !== 'admin') {
                return bot.sendMessage(chatId, "⛔ У вас немає доступу до адмін-панелі.");
            }

            await bot.sendMessage(chatId, "🛠 **Адмін-панель**\n\nВітаємо, шефе! Оберіть розділ для керування ботом:", {
                parse_mode: 'Markdown',
                reply_markup: adminMenu
            });

        } catch (err) {
            console.error("Admin Command Error:", err.message);
            bot.sendMessage(chatId, "❌ Помилка при вході в адмін-панель.");
        }
    });

    // Викликаємо метод callbackHandler з об'єкта
    bot.on('callback_query', (query) =>
        callbacks.callbackHandler(bot, query, sendMainMenu, callbacks) // Передаємо об'єкт callbacks четвертим
    );
    console.log("KEYS IN CALLBACKS:", Object.keys(callbacks));
    // можна було викликати callbacks.renderPromptSettings
    bot.on('message', (msg) =>
        handleMessages(bot, msg, callbacks)
    );

};

module.exports = { setupBotCommands };