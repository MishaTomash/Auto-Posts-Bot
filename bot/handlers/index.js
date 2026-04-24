const User = require('../../models/User');
const Channel = require('../../models/Channel');
const { validateRSS } = require('../../services/rssService');
const { validateJSON } = require('../../services/jsonService')
const { cancelMenu } = require('../keyboards/main');
const { renderPromptSettings } = require('../callbacks/index'); // Потрібно буде експортувати її або перенести
const Plan = require('../../models/Plan');
const { getUsersList } = require('../../services/adminService');
const { getUsersKeyboard } = require('../keyboards/admin');

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
                    isActive: true,
                    // aiPrompt за замовчуванням візьметься зі схеми, якщо тут не вказувати, 
                    // але про всяк випадок дублюємо дефолт:
                    aiPrompt: "Зроби цікавий рерайт цієї новини для Telegram каналу. Використовуй емодзі та короткі речення.",
                    rssUrls: [],
                    tgSources: [],
                    jsonSources: []
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
        // --- ЛОГІКА РЕДАГУВАННЯ КАНАЛІВ ---
        if (state === 'WAITING_FOR_RSS') {
            if (!editingId) return;

            // 1. Знаходимо юзера, щоб дістати ID повідомлення з меню (яке треба оновити)
            const user = await User.findOne({ telegramId: chatId.toString() });
            const menuId = user?.tempData?.menuMessageId;

            // 2. Зберігаємо посилання
            await Channel.findByIdAndUpdate(editingId, { $addToSet: { rssUrls: text } });

            // 3. Скидаємо стан
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: null });

            // 4. Видаляємо повідомлення юзера з лінком (щоб не смітити в чаті)
            bot.deleteMessage(chatId, msg.message_id).catch(() => { });

            // 5. Викликаємо перемальовку меню (використовуємо menuId замість msg.message_id)
            if (callbacks && typeof callbacks.showChannelSettings === 'function') {
                return callbacks.showChannelSettings(chatId, editingId, menuId, user);
            } else {
                console.error("❌ Помилка: callbacks.showChannelSettings не передано в обробник");
            }
        }
        if (state === 'WAITING_FOR_JSON') {
            if (!editingId) return;

            const url = text.trim();
            const statusMsg = await bot.sendMessage(chatId, "⏳ Перевіряю джерело...");
            const isValid = await validateJSON(url);

            bot.deleteMessage(chatId, statusMsg.message_id).catch(() => { });
            bot.deleteMessage(chatId, msg.message_id).catch(() => { });

            if (!isValid) {
                await User.findOneAndUpdate(
                    { telegramId: chatId.toString() },
                    { tempState: 'WAITING_FOR_JSON_RETRY' }
                );

                const errorMsg = await bot.sendMessage(chatId,
                    "❌ <b>Помилка!</b>\n\nЦе посилання не веде до валідного JSON...",
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔄 Спробувати ще раз', callback_data: `retry_json_${editingId}` },
                                { text: '⬅️ Назад до джерел', callback_data: `sources_list_${editingId}` }
                            ]]
                        }
                    }
                );

                // ✅ Зберігаємо ID помилки щоб потім видалити
                await User.findOneAndUpdate(
                    { telegramId: chatId.toString() },
                    { 'tempData.errorMsgId': errorMsg.message_id }
                );

                return;
            }

            // Перевірка на дублікат
            const existingChannel = await Channel.findById(editingId);
            const alreadyExists = existingChannel.jsonSources.some(s => s.url === url);

            if (alreadyExists) {
                await User.findOneAndUpdate(
                    { telegramId: chatId.toString() },
                    { tempState: 'WAITING_FOR_JSON_RETRY' }
                );

                // ✅ Кнопки для дубліката
                return bot.sendMessage(chatId,
                    "⚠️ <b>Це джерело вже додано!</b>\n\nОберіть дію:",
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '➕ Додати інше', callback_data: `retry_json_${editingId}` },
                                { text: '⬅️ Назад до джерел', callback_data: `sources_list_${editingId}` }
                            ]]
                        }
                    }
                );
            }

            // Зберігаємо
            await Channel.findByIdAndUpdate(editingId, {
                $push: { jsonSources: { url: url, label: 'JSON Data' } }
            });

            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                { tempState: null, tempData: {} }
            );

            // ✅ Кнопки після успішного додавання
            return bot.sendMessage(chatId,
                "✅ <b>JSON-джерело успішно додано!</b>\n\nОберіть дію:",
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '➕ Додати ще JSON', callback_data: `retry_json_${editingId}` },
                            { text: '📋 До списку джерел', callback_data: `sources_list_${editingId}` }
                        ]]
                    }
                }
            );
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
            await Channel.findByIdAndUpdate(editingId, { aiPrompt: text.trim() });
            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                { tempState: null, 'tempData.editingChannelId': null }
            );
            bot.deleteMessage(chatId, msg.message_id).catch(() => { });
            await bot.sendMessage(chatId, "✅ Промпт успішно збережено!");

            if (callbacks && typeof callbacks.renderPromptSettings === 'function') {
                return callbacks.renderPromptSettings(bot, chatId, menuId, editingId);
            }
            return callbacks.showChannelSettings(chatId, editingId);
        }
        if (state === 'WAITING_FOR_ADMIN_USER_SEARCH') {
            try {
                // 1. Очищення запиту
                let searchTerm = text.trim();

                // Видаляємо @, якщо адмін ввів нікнейм із ним
                if (searchTerm.startsWith('@')) {
                    searchTerm = searchTerm.substring(1);
                }

                // Перевіряємо, чи не порожній запит після очищення
                if (!searchTerm) {
                    return bot.sendMessage(chatId, "⚠️ Введіть коректний ID або @username.");
                }

                // 2. Викликаємо сервіс із очищеним терміном
                const { users, totalCount } = await getUsersList(1, 10, { search: searchTerm });

                // 3. Скидаємо стан
                await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: null });

                if (!users || users.length === 0) {
                    return bot.sendMessage(chatId, `❌ Користувача "<b>${text}</b>" не знайдено.`, {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔍 Спробувати знову', callback_data: 'admin_user_search' }],
                                [{ text: '🔙 До списку', callback_data: 'admin_users' }]
                            ]
                        }
                    });
                }

                // 4. Результат
                const resultText = `🔍 <b>Результати пошуку:</b>\nЗнайдено користувачів: <b>${totalCount}</b>`;

                return bot.sendMessage(chatId, resultText, {
                    parse_mode: 'HTML',
                    reply_markup: getUsersKeyboard(users, 1, 1)
                });

            } catch (err) {
                console.error("Handler search error:", err);
                return bot.sendMessage(chatId, "⚠️ Помилка під час пошуку. Спробуйте пізніше.");
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
            const sourceUrl = msg.text.trim();

            // Мінімальна перевірка посилання
            if (!sourceUrl.includes('t.me/') && !sourceUrl.startsWith('@')) {
                return bot.sendMessage(chatId, "❌ Це не схоже на посилання Telegram. Спробуйте ще раз або скасуйте дію.");
            }

            await Channel.findByIdAndUpdate(targetChannelId, {
                $push: { tgSources: { url: sourceUrl, lastMessageId: 0 } }
            });

            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: null, tempData: {} });

            return bot.sendMessage(chatId, "✅ Джерело додано! Бот почне стежити за новими постами в цьому каналі.");
        }

        if (user && user.tempState && user.tempState.startsWith('ADMIN_PLAN_EDIT_')) {
            const fieldType = user.tempState.replace('ADMIN_PLAN_EDIT_', '').toLowerCase();
            const planId = user.tempData.editingPlanId;
            const newValue = parseInt(msg.text);

            if (isNaN(newValue)) {
                return bot.sendMessage(chatId, "❌ Помилка: Введіть числове значення (наприклад: 100).");
            }

            const updateData = {};
            if (fieldType === 'price') updateData.price = newValue;
            if (fieldType === 'channels') updateData.maxChannels = newValue;
            if (fieldType === 'posts') updateData.maxPostsPerDay = newValue;

            try {
                await Plan.findByIdAndUpdate(planId, updateData);

                // Скидаємо стан
                await User.updateOne({ telegramId: chatId.toString() }, { tempState: null, tempData: {} });

                return bot.sendMessage(chatId, "✅ Дані тарифу успішно оновлено!", {
                    reply_markup: {
                        inline_keyboard: [[{ text: '📊 Назад до тарифу', callback_data: `admin_plan_view_${planId}` }]]
                    }
                });
            } catch (err) {
                console.error("Plan Update Error:", err);
                await bot.sendMessage(chatId, "❌ Помилка при збереженні в базу.");
            }
        }

        // 1. Обробка Telegram джерела
        if (state === 'WAITING_FOR_TG_SOURCE') {
            if (!editingId) return;
            let sourceUrl = text.trim();
            if (!sourceUrl.startsWith('@') && !sourceUrl.includes('t.me/')) {
                return bot.sendMessage(chatId, "❌ Невірний формат. Надішліть @username або посилання t.me/...");
            }

            await Channel.findByIdAndUpdate(editingId, {
                $push: { tgSources: { url: sourceUrl, lastMessageId: 0 } }
            });
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: null, tempData: {} });
            await bot.sendMessage(chatId, "✅ Telegram-джерело додано!");
            return renderSourcesList(bot, chatId, null, editingId); // Перемальовуємо список
        }

        // 2. Обробка RSS
        if (state === 'WAITING_FOR_RSS_URL') {
            if (!editingId) return;
            await Channel.findByIdAndUpdate(editingId, { $addToSet: { rssUrls: text.trim() } });
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: null, tempData: {} });
            await bot.sendMessage(chatId, "✅ RSS-стрічку додано!");
            return renderSourcesList(bot, chatId, null, editingId);
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
    } catch (e) {
        console.error("Handler Error:", e.message);
    }
};