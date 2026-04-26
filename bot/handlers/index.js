const User = require('../../models/User');
const Channel = require('../../models/Channel');
const { cancelMenu } = require('../keyboards/main');
const Plan = require('../../models/Plan');
const { getUsersList } = require('../../services/adminService');
const { getUsersKeyboard } = require('../keyboards/admin');
const { renderPromptSettings, renderSourcesList } = require('../callbacks/ui_renderers');


module.exports = async (bot, msg, callbacks) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";
    // const response =
    //     `✅ **Назву "${text}" прийнято!**\n` +
    //     `________________________________\n\n` +
    //     `🔗 **Крок 2 з 2: Підключення каналу**\n\n` +
    //     `Куди бот має публікувати готові новини?\n\n` +
    //     `**Надішліть одним повідомленням:**\n` +
    //     `• Посилання (напр. \`t.me/my_channel\`)\n` +
    //     `• Або Username (напр. \`@my_channel\`)\n` +
    //     `• Або числовий ID (напр. \`-100...\`)`;

    // Отримуємо юзера та перевіряємо, чи є активний стан
    const user = await User.findOne({ telegramId: chatId.toString() });
    if (!user || !user.tempState) return;    // --- ЛОГІКА РОЗСИЛКИ ---

    if (user.tempState === 'ADMIN_AWAITING_BROADCAST') {
        // Якщо адмін прислав команду (наприклад /start), то розсилку не робимо
        if (text.startsWith('/')) return;

        const messageIdToCopy = msg.message_id;

        await User.findOneAndUpdate(
            { telegramId: chatId.toString() },
            {
                tempState: 'CONFIRM_BROADCAST',
                tempData: {
                    broadcastMsgId: messageIdToCopy,
                    broadcastFromChatId: chatId
                }
            }
        );

        return bot.sendMessage(chatId, "☝️ <b>Прев'ю розсилки вище.</b>\n\nВідправити це повідомлення всім?", {
            parse_mode: 'HTML',
            reply_to_message_id: messageIdToCopy,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✅ Так, розіслати", callback_data: "admin_bc_start_final" }],
                    [{ text: "❌ Скасувати", callback_data: "admin_dashboard" }]
                ]
            }
        });
    }

    if (!text) return;

    try {
        const chatId = msg.chat.id;
        const user = await User.findOne({ telegramId: chatId.toString() });
        const state = user.tempState;
        const editingId = user.tempData?.editingChannelId;
        const menuId = user.lastMenuMessageId;

        const text = msg.text;



        // Видаляємо повідомлення користувача для чистоти чату
        await bot.deleteMessage(chatId, msg.message_id).catch(() => { });

        if (state === 'STEP_1_NAME') {
            // Використовуємо $set для гарантованого запису в базу
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
        }

        if (state === 'STEP_2_ID') {
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
                const projectName = freshUser.tempData?.name || "Мій проєкт";

                // Створюємо канал за твоєю схемою
                const channelData = {
                    userId: freshUser._id,
                    channelUsername: projectName, // Пишемо назву проєкту сюди
                    channelId: channelIdInput,
                    isActive: false,
                    // aiPrompt за замовчуванням візьметься зі схеми, якщо тут не вказувати, 
                    // але про всяк випадок дублюємо дефолт:
                    aiPrompt: null,
                    tgSources: [],
                };

                const saved = await new Channel(channelData).save();

                // Скидаємо стан
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
                console.error("Create Error:", err);
                return bot.sendMessage(chatId, "❌ Помилка: можливо цей канал вже додано.");
            }
        }
        // Якщо стан заблоковано — ігноруємо будь-який текст
        if (state === 'WAITING_FOR_JSON_RETRY') {
            return bot.sendMessage(chatId,
                "⚠️ Натисни кнопку нижче — <b>«Спробувати ще раз»</b> або <b>«Назад»</b>.",
                { parse_mode: 'HTML' }
            );
        }
        if (state === 'EDIT_PROMPT') {
            if (!editingId) return;

            // 1. Беремо ID повідомлення, яке треба "перетворити" назад на меню
            const menuId = user.tempData.menuMessageId;

            // 2. Зберігаємо текст у базу
            await Channel.findByIdAndUpdate(editingId, { aiPrompt: text.trim() });

            // 3. Очищаємо стан
            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                { tempState: null, tempData: {} }
            );

            // 4. Видаляємо повідомлення з текстом, який написав користувач (чистимо чат)
            bot.deleteMessage(chatId, msg.message_id).catch(() => { });

            // 5. ОНОВЛЮЄМО СТАРЕ ПОВІДОМЛЕННЯ (замість інструкції показуємо знову налаштування)
            if (menuId) {
                // Редагуємо повідомлення, де була кнопка "Скасувати"
                return renderPromptSettings(bot, chatId, menuId, editingId);
            } else {
                // Якщо раптом ID загубився — просто шлемо нове
                return renderPromptSettings(bot, chatId, null, editingId);
            }
        }
        if (state === 'WAITING_BC_TEXT') {
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, {
                'tempData.text': text,
                tempState: 'WAITING_BC_BUTTON'
            });

            return bot.sendMessage(chatId, "🔗 Бажаєте додати кнопку-посилання?\n\nФормат: <code>Текст кнопки | https://url.com</code>\nЯкщо кнопка не потрібна — надішліть цифру <b>0</b>", {
                parse_mode: 'HTML'
            });
        }
        if (state === 'WAITING_BC_BUTTON') {
            let button = null;
            if (text !== '0') {
                const parts = text.split('|').map(p => p.trim());
                if (parts.length === 2) {
                    button = { text: parts[0], url: parts[1] };
                }
            }

            const updatedUser = await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                { 'tempData.button': button, tempState: 'WAITING_BC_CONFIRM' },
                { new: true }
            );

            const bcText = updatedUser.tempData.text;
            const options = { parse_mode: 'HTML' };
            if (button) {
                options.reply_markup = { inline_keyboard: [[{ text: button.text, url: button.url }]] };
            }

            await bot.sendMessage(chatId, "<b>👁 ПЕРЕГЛЯД ПОВІДОМЛЕННЯ:</b>", { parse_mode: 'HTML' });
            await bot.sendMessage(chatId, bcText, options);

            return bot.sendMessage(chatId, `❓ Надіслати це повідомлення усім користувачам?`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ ТАК, ПОЧАТИ РОЗСИЛКУ', callback_data: 'admin_bc_confirm_yes' }],
                        [{ text: '❌ СКАСУВАТИ', callback_data: 'admin_dashboard' }]
                    ]
                }
            });
        }
        if (user.tempState === 'WAITING_TG_SOURCE') {
            const targetChannelId = user.tempData.targetChannelId;
            // Переконайтеся, що ви використовуєте правильний об'єкт повідомлення (msg або message)
            const sourceUrl = (msg.text || "").trim();

            if (!sourceUrl.includes('t.me/') && !sourceUrl.startsWith('@')) {
                return bot.sendMessage(chatId, "❌ Це не схоже на посилання Telegram. Спробуйте ще раз або скасуйте дію.");
            }

            // Додаємо в базу
            const channel = await Channel.findByIdAndUpdate(targetChannelId, {
                $push: { tgSources: { url: sourceUrl, lastMessageId: 0 } }
            }, { new: true });

            // Скидаємо стан
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: null, tempData: {} });

            await bot.sendMessage(chatId, "✅ Джерело додано! Бот почне стежити за новими постами в цьому каналі.");

            // ПІДКАЗКА: Викличте функцію рендеру списку джерел, щоб юзер відразу побачив оновлення
            return renderSourcesList(bot, chatId, user.lastMenuMessageId, targetChannelId);
        }

        if (state === 'WAITING_FOR_ADMIN_USER_SEARCH') {
            const searchTerm = text.trim().replace('@', '');

            // Викликаємо сервіс з фільтром пошуку
            const { users, totalCount } = await getUsersList(1, 10, { search: searchTerm });

            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: null });
            bot.deleteMessage(chatId, msg.message_id).catch(() => { });

            if (!users || users.length === 0) {
                return bot.sendMessage(chatId, `❌ Користувача <b>${searchTerm}</b> не знайдено.`, {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: [[{ text: '🔍 Спробувати знову', callback_data: 'admin_user_search' }]] }
                });
            }

            // Показуємо результат через клавіатуру списку (як на фото 2)
            return bot.sendMessage(chatId, `🔍 Знайдено результатів: ${totalCount}`, {
                parse_mode: 'HTML',
                reply_markup: getUsersKeyboard(users, 1, 1)
            });
        }

        // 2. Редагування тарифів (Твій код, який ти надіслав останнім)
        if (state && state.startsWith('ADMIN_PLAN_EDIT_')) {
            const fieldType = state.replace('ADMIN_PLAN_EDIT_', '').toLowerCase();
            const planId = user.tempData.editingPlanId;
            const newValue = parseInt(text);

            if (isNaN(newValue)) return bot.sendMessage(chatId, "❌ Введіть число.");

            const updateData = {};
            if (fieldType === 'price') updateData.price = newValue;
            if (fieldType === 'channels') updateData.maxChannels = newValue;
            if (fieldType === 'posts') updateData.maxPostsPerDay = newValue;

            await Plan.findByIdAndUpdate(planId, updateData);
            await User.updateOne({ telegramId: chatId.toString() }, { tempState: null, tempData: {} });

            return bot.sendMessage(chatId, "✅ Тариф оновлено!", {
                reply_markup: { inline_keyboard: [[{ text: '📊 Назад', callback_data: `admin_plan_view_${planId}` }]] }
            });
        }

        // 1. Обробка Telegram джерела
        if (state === 'WAITING_FOR_TG_SOURCE') {
            if (!editingId) return;

            let sourceUrl = text.trim();

            // 1. Перевірка формату
            if (!sourceUrl.startsWith('@') && !sourceUrl.includes('t.me/')) {
                return bot.sendMessage(chatId, "❌ Невірний формат. Надішліть @username або посилання t.me/...");
            }

            try {
                const channel = await Channel.findById(editingId);
                if (!channel) return;

                // 2. Перевірка, чи вже є таке джерело в списку (щоб не було дублів)
                const isDuplicate = channel.tgSources.some(src => src.url === sourceUrl);
                if (isDuplicate) {
                    return bot.sendMessage(chatId, "⚠️ Це джерело вже додане до списку.");
                }

                // 3. Додавання нового джерела
                await Channel.findByIdAndUpdate(editingId, {
                    $push: { tgSources: { url: sourceUrl, lastMessageId: 0 } }
                });

                // Скидаємо стан юзера
                await User.findOneAndUpdate(
                    { telegramId: chatId.toString() },
                    { tempState: null, tempData: {} }
                );

                await bot.sendMessage(chatId, "✅ Telegram-джерело додано!");

                // Повертаємо користувача до списку джерел
                return renderSourcesList(bot, chatId, null, editingId);

            } catch (error) {
                console.error("Помилка додавання TG джерела:", error);
                await bot.sendMessage(chatId, "❌ Помилка бази даних. Спробуйте пізніше.");
            }
        }

        if (user.state === 'WAITING_FOR_CHANNEL_ID') {
            let channelIdInput = text.trim();

            // 1. Очищуємо посилання, якщо користувач скинув t.me/username
            if (channelIdInput.includes('t.me/')) {
                channelIdInput = '@' + channelIdInput.split('t.me/')[1].replace('/', '');
            }

            // 2. Якщо користувач забув @ на початку юзернейма
            if (!channelIdInput.startsWith('@') && !channelIdInput.startsWith('-100') && isNaN(channelIdInput)) {
                channelIdInput = '@' + channelIdInput;
            }

            try {
                // Створюємо новий проєкт (канал)
                const newChannel = new Channel({
                    userId: chatId,
                    name: user.tempChannelName,
                    channelId: channelIdInput, // Тут буде або @username, або -1001234567
                    language: 'ukrainian', // Дефолт
                    isPaused: true,
                    prompt: "Зроби рерайт цієї новини українською мовою, збережи суть, додай емодзі та структуруй текст."
                });

                await newChannel.save();

                // Скидаємо стан
                user.state = null;
                user.tempChannelName = null;
                await user.save();

                return bot.sendMessage(chatId,
                    `✅ **Проєкт "${newChannel.name}" створено!**\n\n` +
                    `**Прив'язаний канал:** \`${channelIdInput}\`\n\n` +
                    `Зараз бот на паузі. Щоб він почав працювати:\n` +
                    `1. Додайте бота в адміністратори вашого каналу.\n` +
                    `2. Додайте джерела новин (RSS або канали-донори).`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "⚙️ Налаштувати проєкт", callback_data: `settings_${newChannel._id}` }],
                                [{ text: "🗂 Мої проєкти", callback_data: "my_channels" }]
                            ]
                        }
                    }
                );
            } catch (error) {
                console.error("Помилка створення каналу:", error);
                return bot.sendMessage(chatId, "❌ Не вдалося створити проєкт. Можливо, цей ID вже використовується.");
            }
        }
        // Вставити всередину обробника текстових повідомлень
        if (user.tempState === 'WAITING_MANUAL_INTERVAL') {
            const minutes = parseInt(text);
            if (isNaN(minutes) || minutes < 1) {
                return bot.sendMessage(chatId, "❌ Будь ласка, введіть число (мінімум 1 хвилина).");
            }

            const chId = user.tempData.targetChannelId;
            await Channel.findByIdAndUpdate(chId, {
                checkInterval: minutes,
                scheduleMode: 'interval'
            });

            user.tempState = null;
            user.tempData = null;
            await user.save();

            return bot.sendMessage(chatId, `✅ Інтервал оновлено: <b>кожні ${minutes} хв.</b>`, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: '⚙️ До налаштувань', callback_data: `manage_${chId}` }]] }
            });
        }
    } catch (e) {
        console.error("Handler Error:", e.message);
    }
};