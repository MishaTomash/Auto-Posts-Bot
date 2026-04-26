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

            // Шукаємо канал в базі
            const channel = await Channel.findById(cleanId);

            if (!channel) {
                console.log("❌ Канал не знайдено в БД по ID:", cleanId);
                return;
            }

            // Отримуємо користувача, якщо він не переданий
            if (!user) {
                user = await User.findOne({ telegramId: chatId.toString() });
            }

            // Статус проекту
            const projectStatus = channel.isActive ? "🟢 АКТИВНИЙ" : "🔴 НА ПАУЗІ";

            // Підраховуємо кількість TG джерел
            const tgCount = channel.tgSources?.length || 0;

            const text = `⚙️ Керування: <b>${channel.channelUsername || 'Без назви'}</b>\n\n` +
                `📊 Стан проєкту: <b>${projectStatus}</b>\n` +
                `⏱ Інтервал: ${channel.checkInterval || 60} хв\n` +
                `📱 Джерела: TG канали (${tgCount})`;

            const opts = {
                parse_mode: 'HTML',
                reply_markup: {
                    // Використовуємо вашу функцію клавіатури
                    inline_keyboard: getChannelSettingsKeyboard(channel, user)
                }
            };

            if (messageId) {
                await bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...opts
                }).catch(err => {
                    if (!err.message.includes('message is not modified')) {
                        console.error("Помилка редагування налаштувань:", err.message);
                    }
                });
            } else {
                await bot.sendMessage(chatId, text, opts);
            }

        } catch (e) {
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