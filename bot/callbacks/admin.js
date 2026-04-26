// bot/callbacks/admin.js
const User = require('../../models/User');
const Channel = require('../../models/Channel');
const Plan = require('../../models/Plan');
const Log = require('../../models/Log');
const PLANS = require('../../config/plans');

const {
    getAdminStats,
    getUsersList,
    getChannelsList,
    getAllPlans
} = require('../../services/adminService');

const {
    getAdminDashboardKeyboard,
    getUsersKeyboard,
    getChannelsKeyboard,
    getAdminPlansKeyboard,
    getPlanEditKeyboard,
    getUserManageKeyboard,
    getChannelAdminControlKeyboard,
    getChannelSourcesKeyboard,
    getSourceConfirmKeyboard,
    getConfirmKeyboard
} = require('../keyboards/admin');

const { renderAdminDashboard, renderPlanEditCard, renderChannelSettings } = require('./ui_renderers');
const { exportUsersToCSV } = require('../../services/exportService');
const { processSingleChannel } = require('../../services/postService');

const adminHandler = async (bot, query, user, callbackHandler) => {
    const { data } = query;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    if (user.telegramId === process.env.ADMIN_TELEGRAM_ID && user.role !== 'admin') {
        user.role = 'admin';
        await user.save();
        console.log(`⭐ Користувачу ${user.username} автоматично надано права адміна`);
    }
    // 1. ПЕРЕВІРКА ПРАВ (Захист адмінки)
    if (!user || user.role !== 'admin') {
        return bot.answerCallbackQuery(query.id, {
            text: "⛔ Доступ заборонено! Ви не є адміністратором.",
            show_alert: true
        });
    }

    try {
        // --- ГОЛОВНИЙ ДАШБОРД (Фото 1) ---
        if (data === 'admin_dashboard' || data === 'admin_main') {
            await bot.answerCallbackQuery(query.id).catch(() => { });
            return renderAdminDashboard(bot, chatId, messageId);
        }

        // --- УПРАВЛІННЯ КОРИСТУВАЧАМИ (Список та пагінація) ---
        if (data === 'admin_users' || data.startsWith('admin_users_page_')) {
            await bot.answerCallbackQuery(query.id).catch(() => { });
            const page = data.startsWith('admin_users_page_') ? parseInt(data.split('_')[3]) : 1;

            const { users, totalPages, totalCount } = await getUsersList(page, 10);
            const updateTime = new Date().toLocaleTimeString('uk-UA');

            const text = `👥 <b>Управління користувачами</b>\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `Усього: <b>${totalCount}</b>\n` +
                `Сторінка: <b>${page}/${totalPages}</b>\n` +
                `<i>🕒 Оновлено о: ${updateTime}</i>`;

            return bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: getUsersKeyboard(users, page, totalPages)
            });
        }

        // --- ПОШУК КОРИСТУВАЧА ---
        if (data === 'admin_user_search') {
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: 'WAITING_FOR_ADMIN_USER_SEARCH' });
            return bot.editMessageText('🔍 <b>Пошук користувача</b>\n\nВведіть @username або прямий ID:', {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: '❌ Скасувати', callback_data: 'admin_users' }]] }
            });
        }

        // --- КАРТКА КОРИСТУВАЧА ---
        if (data.startsWith('admin_user_view_')) {
            const userId = data.split('_')[3];
            const targetUser = await User.findById(userId);
            if (!targetUser) return bot.answerCallbackQuery(query.id, { text: "❌ Користувача не знайдено" });

            // ВИПРАВЛЕНО: Рахуємо канали за userId, а не за неіснуючим ownerId
            const channelCount = await Channel.countDocuments({ userId: targetUser._id });

            const text = `👤 <b>Картка користувача</b>\n━━━━━━━━━━━━━━━━━━\n` +
                `<b>Ім'я:</b> ${targetUser.username || 'Немає'}\n` +
                `<b>ID:</b> <code>${targetUser.telegramId}</code>\n` +
                `<b>Роль:</b> ${targetUser.role}\n` +
                `<b>Тариф:</b> ${targetUser.subscription?.plan?.toUpperCase() || 'FREE'}\n` +
                `<b>Каналів:</b> ${channelCount}\n` + // Тепер тут буде правильна цифра
                `━━━━━━━━━━━━━━━━━━\n🕒 <i>Оновлено: ${new Date().toLocaleTimeString('uk-UA')}</i>`;

            return bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: getUserManageKeyboard(targetUser._id, targetUser.isBlocked)
            });
        }
        // --- ТАРИФИ ТА ПЛАНИ ---
        if (data === 'admin_plans') {
            const plans = await getAllPlans();
            return bot.editMessageText("💳 <b>Управління тарифами</b>", {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: getAdminPlansKeyboard(plans)
            });
        }

        if (data.startsWith('admin_plan_view_')) {
            const planId = data.split('_')[3];
            return renderPlanEditCard(bot, chatId, messageId, planId);
        }

        if (data.startsWith('admin_plan_edit_ai_')) { // AI Toggle
            const planId = data.split('_')[4];
            const currentPlan = await Plan.findById(planId);
            const newValue = !currentPlan.hasCustomPrompt;
            await Plan.findByIdAndUpdate(planId, { $set: { hasCustomPrompt: newValue } });
            return renderPlanEditCard(bot, chatId, messageId, planId);
        }

        // --- КЕРУВАННЯ ДЖЕРЕЛАМИ КАНАЛУ (Для Адміна) ---
        if (data.startsWith('admin_ch_sources_')) {
            const chId = data.replace('admin_ch_sources_', '');
            const channel = await Channel.findById(chId);

            if (!channel) {
                return bot.answerCallbackQuery(query.id, { text: "❌ Канал не знайдено" });
            }

            return bot.editMessageText(`📂 <b>Керування Telegram-джерелами</b>\n\nТут ви можете налаштувати канали, з яких бот буде брати контент.`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: getChannelSourcesKeyboard(chId, channel.tgSources) // Тільки tgSources
            });
        }

        if (data.startsWith('admin_src_del_')) {
            // data формат: admin_src_del_tg_CHID_INDEX
            const parts = data.split('_');
            const chId = parts[4];
            const idx = parseInt(parts[5]);

            const channel = await Channel.findById(chId);

            if (channel && channel.tgSources) {
                // Видаляємо лише з масиву Telegram-джерел
                channel.tgSources.splice(idx, 1);

                await channel.save();
                await bot.answerCallbackQuery(query.id, { text: "✅ Джерело видалено" });

                // Повертаємось до оновленого списку (передаємо лише tgSources)
                return bot.editMessageText(`📂 <b>Керування джерелами каналу</b>`, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: getChannelSourcesKeyboard(chId, channel.tgSources)
                });
            } else {
                await bot.answerCallbackQuery(query.id, { text: "❌ Помилка: канал або джерело не знайдено" });
            }
        }
        if (data.startsWith('admin_ch_view_')) {
            const chId = data.replace('admin_ch_view_', '');
            const channel = await Channel.findById(chId).populate('userId');

            const text = `📺 <b>Канал:</b> ${channel.channelUsername}\n` +
                `👤 <b>Власник:</b> @${channel.userId?.username || 'ID:' + channel.userId?.telegramId}\n` +
                `📊 <b>Статус:</b> ${channel.isActive ? '✅ Активний' : '❌ Пауза'}`;

            return bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: getChannelAdminControlKeyboard(chId, channel.isActive)
            });
        }
        // --- РОЗСИЛКА ТА БРОАДКАСТ ---
        if (data === 'admin_broadcast') {
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: 'ADMIN_AWAITING_BROADCAST' });
            return bot.editMessageText("📢 <b>РЕЖИМ РОЗСИЛКИ</b>\n\nНадішліть повідомлення для всіх користувачів:", {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: '❌ Скасувати', callback_data: 'admin_dashboard' }]] }
            });
        }

        if (data === 'admin_bc_start_final') {
            const admin = await User.findOne({ telegramId: chatId.toString() });
            const { broadcastMsgId, broadcastFromChatId } = admin.tempData;
            const allUsers = await User.find({ isBlocked: { $ne: true } });

            bot.sendMessage(chatId, `🚀 Розсилка для ${allUsers.length} юзерів розпочата...`);
            for (const u of allUsers) {
                await bot.copyMessage(u.telegramId, broadcastFromChatId, broadcastMsgId).catch(() => { });
                await new Promise(r => setTimeout(r, 50));
            }
            return bot.sendMessage(chatId, "✅ Розсилку завершено!");
        }


        // --- ЕКСПОРТ ТА ЛОГИ ---
        if (data === 'admin_logs_errors') {
            const errors = await Log.find({ type: 'ERROR' }).sort({ createdAt: -1 }).limit(10);
            let logText = "❌ <b>Останні помилки:</b>\n\n" + errors.map(e => `🕒 ${e.createdAt.toLocaleString()}\n💬 ${e.details}`).join('\n---\n');
            return bot.editMessageText(logText, {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin_main' }]] }
            });
        }

        if (data === 'admin_export_users') {
            const csvBuffer = await exportUsersToCSV();
            return bot.sendDocument(chatId, csvBuffer, { caption: "📊 Експорт користувачів" });
        }

        // --- ПЕРЕМИКАЧ КАНАЛУ (Toggle) ---

        if (data.startsWith('admin_user_delete_request_')) {
            const userId = data.split('_')[4];

            // ВАЖЛИВО: Відповісти на callback query, щоб кнопка перестала "висіти"
            await bot.answerCallbackQuery(query.id);

            // Використовуємо await для editMessageText
            await bot.editMessageText("⚠️ <b>УВАГА!</b>\nВи намагаєтесь видалити користувача. Це видалить всі його канали та дані. Ви впевнені?", {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: getConfirmKeyboard('deleteUser', userId)
            });

            return; // Важливо: повернути, щоб не було подальшої обробки
        }
        // Знайти блок confirm_yes_ у файлі index (1).js
        // bot/callbacks/index.js

        if (data.startsWith('admin_confirm_')) {
            const targetId = data.split('_')[3];
            console.log(`🚀 ЗАПУСК ВИДАЛЕННЯ: ID ${targetId}`);

            try {
                await bot.answerCallbackQuery(query.id).catch(() => { });

                // 1. Видаляємо канали користувача
                const channelResult = await Channel.deleteMany({ userId: targetId });
                console.log(`🗑 Видалено проєктів: ${channelResult.deletedCount}`);

                // 2. Видаляємо самого користувача
                const userResult = await User.findByIdAndDelete(targetId);

                if (!userResult) {
                    return bot.sendMessage(chatId, "❌ Користувача не знайдено.");
                }

                console.log(`✅ Юзер ${userResult.username} видалений успішно`);

                // 3. Оновлюємо список користувачів
                const { getUsersList } = require('../../services/adminService');
                const { users, totalPages, totalCount } = await getUsersList(1, 10);
                const { getUsersKeyboard } = require('../keyboards/admin');

                const updateTime = new Date().toLocaleTimeString('uk-UA');
                const text = `👥 <b>Управління користувачами</b>\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `Усього: <b>${totalCount}</b>\n` +
                    `Сторінка: 1/${totalPages}\n` +
                    `<i>✅ Користувача видалено успішно! (${updateTime})</i>`;

                return await bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: getUsersKeyboard(users, 1, totalPages)
                });

            } catch (error) {
                console.error("🔴 Помилка при видаленні:", error.message);
            }
        }

        if (data.startsWith('admin_ch_toggle_')) {
            const channelId = data.replace('admin_ch_toggle_', '');
            const channel = await Channel.findById(channelId);

            if (!channel) return bot.answerCallbackQuery(query.id, { text: "❌ Не знайдено" });

            // Використовуємо isActive скрізь для стабільності
            channel.isActive = !channel.isActive;
            await channel.save();

            await bot.answerCallbackQuery(query.id, {
                text: channel.isActive ? "🚀 Проєкт активовано" : "⏸ На паузі"
            });

            // Оновлюємо меню (викликаємо функцію рендеру)
            return showChannelSettings(chatId, channelId, messageId, user);
        }

        if (data.startsWith('admin_user_plan_')) {
            const userId = data.split('_')[3];
            const plans = ['free', 'basic', 'pro', 'business'];

            const buttons = plans.map(plan => ([{
                text: plan.toUpperCase(),
                callback_data: `admin_set_plan_${plan}_${userId}` // Це веде до обробника встановлення тарифу
            }]));
            buttons.push([{ text: '🔙 Назад до картки', callback_data: `admin_user_view_${userId}` }]);

            return bot.editMessageText('💎 <b>Оберіть новий тариф для користувача:</b>', {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: buttons }
            });
        }
        if (data.startsWith('admin_ch_sources_')) {
            const chId = data.replace('admin_ch_sources_', '');
            const channel = await Channel.findById(chId);

            if (!channel) {
                return bot.answerCallbackQuery(query.id, { text: "❌ Канал не знайдено" });
            }

            // Оновлений текст та виклик клавіатури без JSON
            return bot.editMessageText(`📂 <b>Керування Telegram-джерелами</b>\n\nВиберіть джерело для видалення або додайте нове.`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: getChannelSourcesKeyboard(chId, channel.tgSources)
            });
        }
        if (data === 'admin_export_users') {
            await bot.answerCallbackQuery(query.id, { text: "Генерую файл..." });
            const csvBuffer = await exportUsersToCSV();

            return bot.sendDocument(chatId, csvBuffer, {
                caption: "📊 Список користувачів (CSV)",
            }, {
                filename: `users_export_${new Date().toLocaleDateString()}.csv`,
                contentType: 'text/csv'
            });
        }
        if (data === 'admin_logs_errors') {
            const errors = await Log.find({ type: 'ERROR' }).sort({ createdAt: -1 }).limit(10);
            let logText = "❌ <b>Останні помилки:</b>\n\n";

            if (errors.length === 0) logText += "Помилок не знайдено.";
            errors.forEach(err => {
                logText += `🕒 ${err.createdAt.toLocaleString()}\n💬 ${err.details}\n---\n`;
            });

            return bot.editMessageText(logText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin_main' }]] }
            });
        }
        if (data.startsWith('admin_plan_view_')) {
            const planId = data.split('_')[3];
            return renderPlanEditCard(bot, chatId, messageId, planId);
        }

        if (data.startsWith('admin_plan_edit_') && !data.includes('_ai_')) {
            const [, , , field, planId] = data.split('_'); // price, channels, posts

            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                {
                    tempState: `ADMIN_PLAN_EDIT_${field.toUpperCase()}`,
                    tempData: { editingPlanId: planId }
                }
            );

            const labels = { 'price': 'ціну (Stars)', 'channels': 'ліміт каналів', 'posts': 'ліміт постів' };
            return bot.editMessageText(`📝 Введіть нову **${labels[field] || field}** (цифрами):`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Скасувати', callback_data: `admin_plan_view_${planId}` }]] }
            });
        }
        if (data === 'admin_plans') {
            await bot.answerCallbackQuery(query.id).catch(() => { });
            const { getAllPlans } = require('../../services/adminService');
            const { getAdminPlansKeyboard } = require('../keyboards/admin');

            const plans = await getAllPlans();

            if (!plans || plans.length === 0) {
                return bot.editMessageText("⚠️ **Тарифи відсутні в базі даних.**", {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin_dashboard' }]] }
                });
            }

            return bot.editMessageText("💳 **Управління тарифами**\n\nОберіть тариф для редагування:", {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: getAdminPlansKeyboard(plans)
            });
        }
        if (data.startsWith('admin_ch_delete_')) {
            const chId = data.split('_')[3];

            try {
                await bot.answerCallbackQuery(query.id, { text: "Канал видаляється..." });

                await Channel.findByIdAndDelete(chId);
                console.log(`[TMX] Канал ${chId} успішно видалено`);

                // Повертаємось до списку каналів (сторінка 1)
                const { channels, totalPages, totalCount } = await getChannelsList(1);

                return bot.editMessageText(
                    `📺 <b>Список усіх каналів</b> (${totalCount})\nСторінка 1/${totalPages}:`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        reply_markup: getChannelsKeyboard(channels, 1, totalPages)
                    }
                );

            } catch (e) {
                console.error('Помилка в блоці видалення:', e);
                await bot.answerCallbackQuery(query.id, { text: "Помилка при видаленні" }).catch(() => { });
            }
        }
        if (
            data === 'admin_channels' ||
            data === 'admin_channels_list' ||
            data.startsWith('admin_ch_page_')
        ) {
            const page = data.startsWith('admin_ch_page_') ? parseInt(data.split('_')[3]) : 1;
            const { getChannelsList } = require('../../services/adminService');
            const { getChannelsKeyboard } = require('../keyboards/admin');

            const { channels, totalPages, totalCount } = await getChannelsList(page);

            return bot.editMessageText(`📺 <b>Список усіх каналів</b> (${totalCount})\nСторінка ${page}/${totalPages}:`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: getChannelsKeyboard(channels, page, totalPages)
            });
        }

        // Перегляд деталей Telegram джерела
        if (data.startsWith('admin_src_view_tg_')) {
            const [, , , , chId, index] = data.split('_');
            const channel = await Channel.findById(chId);
            const src = channel.tgSources[parseInt(index)];

            const text = `📢 <b>Деталі TG джерела:</b>\n\n` +
                `<b>Канал:</b> <code>${src.url}</code>\n` +
                `<b>Тип:</b> Telegram донор`;

            return bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: getSourceConfirmKeyboard(chId, 'tg', index)
            });
        }
        // bot/callbacks/admin.js

        if (data.startsWith('admin_set_plan_')) {
            try {
                const parts = data.split('_');
                const planName = parts[3];
                const userId = parts[4];

                const planConfig = PLANS[planName];
                if (!planConfig) return bot.answerCallbackQuery(query.id, { text: "Тариф не знайдено" });

                await User.findByIdAndUpdate(userId, {
                    $set: {
                        'subscription.plan': planName,
                        'subscription.maxChannels': planConfig.maxChannels,
                        'subscription.maxPostsPerDay': planConfig.maxPostsPerDay,
                        'subscription.expiresAt': planName === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                    }
                });

                await bot.answerCallbackQuery(query.id, { text: `✅ Тариф ${planName.toUpperCase()} встановлено!`, show_alert: true });

                // 2. ТЕПЕР ЦЕ ПРАЦЮВАТИМЕ, бо ми передали функцію
                if (typeof callbackHandler === 'function') {
                    return callbackHandler(bot, { ...query, data: `admin_user_view_${userId}` }, user);
                } else {
                    // Якщо раптом функція не прийшла, просто відправляємо назад до списку через прямий виклик
                    return bot.editMessageText("Оновлено. Поверніться до списку користувачів.", {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin_users' }]] }
                    });
                }

            } catch (error) {
                console.error("❌ Помилка при зміні тарифу:", error);
                bot.answerCallbackQuery(query.id, { text: "⚠️ Помилка БД" });
            }
        }
    } catch (error) {
        console.error("🔴 Admin Handler Critical Error:", error);
        return bot.answerCallbackQuery(query.id, { text: "⚠️ Помилка: " + error.message, show_alert: true });
    }
};

module.exports = adminHandler;