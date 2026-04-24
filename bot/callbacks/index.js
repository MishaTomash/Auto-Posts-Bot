

const User = require('../../models/User');
const Channel = require('../../models/Channel');
const { processNews, processSingleChannel } = require('../../services/postService');
const { cancelMenu } = require('../keyboards/main');
const { getChannelSettingsKeyboard, getIntervalKeyboard } = require('../keyboards/channel');
const { DEFAULT_PROMPT } = require('../../services/aiService');
const PLANS = require('../../config/plans');
const { getChannelAdminControlKeyboard, getChannelSourcesKeyboard, getSourceConfirmKeyboard } = require('../keyboards/admin');
const Log = require('../../models/Log');
const { exportUsersToCSV } = require('../../services/exportService');
const { isAdmin } = require('../middleware/auth');
const Plan = require('../../models/Plan');

const {
    getAdminStats,
    getAllPlans, // Додай це, якщо немає
    getUsersList,
    getChannelsList
} = require('../../services/adminService');

const {
    getUserManageKeyboard,
    getAdminDashboardKeyboard,
    getAdminPlansKeyboard,
    getPlanEditKeyboard,
    getUsersKeyboard,
    getChannelsKeyboard,
} = require('../keyboards/admin');



// Додайте цю допоміжну функцію на початку файлу або використайте готову
const escapeHTML = (str) => {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

async function renderPromptSettings(bot, chatId, messageId, chId) {
    try {
        const ch = await Channel.findById(chId);
        if (!ch) return;

        // Пріоритет: 1. Промпт з бази | 2. Наш DEFAULT_PROMPT
        const isCustom = !!ch.aiPrompt;
        const rawPrompt = ch.aiPrompt || DEFAULT_PROMPT;

        const safePrompt = escapeHTML(rawPrompt);
        const statusLabel = isCustom ? "🟡 Користувацький" : "🟢 Стандартний";

        const text = `🤖 <b>Налаштування AI Промпту</b>\n\n` +
            `Статус: ${statusLabel}\n\n` +
            `<b>Текст промпту:</b>\n<code>${safePrompt}</code>`;

        const keyboard = [];

        // Кнопка змінити
        keyboard.push([{ text: '✏️ Змінити промпт', callback_data: `start_edit_prompt_${chId}` }]);

        // Кнопка "Скинути" показується тільки якщо зараз стоїть кастомний текст
        if (isCustom) {
            keyboard.push([{ text: '🔄 Скинути до стандартного', callback_data: `reset_prompt_${chId}` }]);
        }

        keyboard.push([{ text: '⬅️ Назад до налаштувань', callback_data: `manage_${chId}` }]);

        await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error("❌ Помилка в renderPromptSettings:", error);
    }
}

const renderPlanEditCard = async (bot, chatId, messageId, planId) => {
    try {
        const plan = await Plan.findById(planId);
        if (!plan) return;

        const now = new Date().toLocaleTimeString('uk-UA');

        // ВИПРАВЛЕНО: Знову використовуємо 'hasCustomPrompt'
        const isAiEnabled = !!plan.hasCustomPrompt;

        const text = `⚙️ <b>Налаштування тарифу: ${plan.name.toUpperCase()}</b>\n\n` +
            `💰 Ціна: <b>${plan.price} Stars</b>\n` +
            `📺 Макс. каналів: <b>${plan.maxChannels}</b>\n` +
            `📝 Постів на день: <b>${plan.maxPostsPerDay}</b>\n` +
            `🤖 Custom AI Промпт: <b>${isAiEnabled ? '✅ Увімкнено' : '❌ Вимкнено'}</b>\n\n` +
            `<i>🕒 Останнє оновлення: ${now}</i>`;

        const { getPlanEditKeyboard } = require('../keyboards/admin');

        return await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getPlanEditKeyboard(planId, isAiEnabled)
        }).catch(err => {
            if (!err.message.includes('message is not modified')) {
                console.error("Render Error:", err.message);
            }
        });
    } catch (err) {
        console.error("Critical Render Error:", err);
    }
};
const renderSubscriptionShop = async (bot, chatId, messageId, backTarget) => {
    // 1. Отримуємо плани та дані юзера
    const allPlans = await Plan.find({ isActive: true }).sort({ price: 1 });
    const user = await User.findOne({ telegramId: chatId.toString() }); // Шукаємо юзера

    const freePlan = allPlans.find(p => p.name === 'free');
    const paidPlans = allPlans.filter(p => p.name !== 'free');

    // Отримуємо назву поточного плану юзера (наприклад, 'basic')
    const userCurrentPlan = user?.subscription?.plan || 'free';

    let message = "💎 **ОБЕРІТЬ ТАРИФ**\n━━━━━━━━━━━━━━━━━━━━━━\n";

    if (freePlan) {
        message += `⭐️ **${freePlan.displayName}** — Безкоштовно\n`;
        message += `• Каналів: ${freePlan.maxChannels}\n`;
        message += `• Постів на день: ${freePlan.maxPostsPerDay}\n`;
        message += `• AI Промпт: ❌\n\n`;
    }

    const keyboard = { inline_keyboard: [] };

    for (const plan of paidPlans) {
        const title = plan.displayName || plan.name.toUpperCase();
        const price = plan.price ?? 0;

        message += `⭐️ **${title}** — ${price} Stars\n`;
        message += `• Каналів: ${plan.maxChannels}\n`;
        message += `• Постів на день: ${plan.maxPostsPerDay}\n`;
        message += `• AI Промпт: ${plan.hasCustomPrompt ? '✅' : '❌'}\n\n`;

        // ЛОГІКА КНОПКИ: Якщо назва плану в базі збігається з назвою в циклі
        const isCurrent = plan.name === userCurrentPlan;
        const btnText = isCurrent
            ? `🔄 Продовжити ${title} (${price} ⭐️)`
            : `Купити ${title} (${price} ⭐️)`;

        keyboard.inline_keyboard.push([{
            text: btnText,
            callback_data: `buy_plan_${plan.name}`
        }]);
    }

    keyboard.inline_keyboard.push([{
        text: '⬅️ Назад',
        callback_data: backTarget
    }]);

    return await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
};

async function renderSourcesList(bot, chatId, messageId, chId) {
    const ch = await Channel.findById(chId);
    if (!ch) return;

    let text = `📋 <b>Джерела для:</b> ${ch.channelUsername}\n\n`;
    const keyboard = [];

    // 1. Вивід RSS
    if (ch.rssUrls?.length > 0) {
        text += `🌐 <b>RSS стрічки:</b>\n`;
        ch.rssUrls.forEach((url, index) => {
            text += `${index + 1}. <code>${url}</code>\n`;
            keyboard.push([{ text: `🗑 Видалити RSS #${index + 1}`, callback_data: `remove_rss_${chId}_${index}` }]);
        });
        text += `\n`;
    }

    // 2. НОВЕ: Вивід Telegram джерел
    if (ch.tgSources?.length > 0) {
        text += `📱 <b>Telegram канали:</b>\n`;
        ch.tgSources.forEach((src, index) => {
            text += `${index + 1}. <code>${src.url}</code>\n`;
            keyboard.push([{ text: `🗑 Видалити TG #${index + 1}`, callback_data: `remove_tgsrc_${chId}_${index}` }]);
        });
        text += `\n`;
    }

    // 3. Вивід JSON
    if (ch.jsonSources?.length > 0) {
        text += `🔗 <b>JSON джерела:</b>\n`;
        ch.jsonSources.forEach((src, index) => {
            text += `${index + 1}. <b>${src.label}</b>\n<code>${src.url}</code>\n`;
            keyboard.push([{ text: `🗑 Видалити JSON #${index + 1}`, callback_data: `remove_json_${chId}_${index}` }]);
        });
    }

    if (!ch.rssUrls?.length && !ch.jsonSources?.length && (!ch.tgSources || !ch.tgSources.length)) {
        text += `<i>Джерел поки не додано.</i>`;
    }

    // Кнопки додавання (згруповані)
    keyboard.push([
        { text: '➕ RSS', callback_data: `add_rss_${chId}` },
        { text: '➕ TG Канал', callback_data: `add_tgsrc_${chId}` }, // НОВА КНОПКА
        { text: '➕ JSON', callback_data: `add_json_${chId}` }
    ]);

    keyboard.push([{ text: '⬅️ Назад до налаштувань', callback_data: `manage_${chId}` }]);

    return bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: keyboard }
    });
}

// 1. Створюємо функцію для рендеру (винеси її вище в файлі)
const renderProfile = async (bot, chatId, messageId, user, queryId = null) => {
    try {
        if (!user) return;

        // 1. Отримуємо актуальні дані тарифу юзера з бази ПЛАНІВ
        const planData = await Plan.findOne({ name: user.subscription.plan });

        // 2. АВТО-ВИПРАВЛЕННЯ: Якщо в плані AI дозволено, а в юзера в базі ще стоїть false
        // Ми автоматично оновлюємо юзера прямо зараз
        if (planData && planData.hasCustomPrompt !== user.subscription.hasCustomPrompt) {
            user.subscription.hasCustomPrompt = planData.hasCustomPrompt;
            user.subscription.maxChannels = planData.maxChannels;
            user.subscription.maxPostsPerDay = planData.maxPostsPerDay;
            await user.save();
            console.log(`✅ Профіль юзера ${chatId} автоматично синхронізовано з тарифом`);
        }

        const sub = user.subscription;
        const userChannelsCount = await Channel.countDocuments({ userId: user._id });
        const stats = user.dailyPostStats || { count: 0 };

        const expiryDate = sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('uk-UA') : '—';
        const aiStatus = sub.hasCustomPrompt ? '✅ Доступно' : '❌ Недоступно';

        const profileText = `<b>👤 Ваш профіль</b>\n\n` +
            `🆔 ID: <code>${user.telegramId}</code>\n` +
            `🏷 Тариф: <b>${sub.plan.toUpperCase()}</b>\n\n` +
            `📊 <b>Ваші ліміти:</b>\n` +
            `📺 Каналів: <b>${userChannelsCount} / ${sub.maxChannels}</b>\n` +
            `📝 Постів сьогодні: <b>${stats.count} / ${sub.maxPostsPerDay}</b>\n` +
            `🤖 AI Промпт: <b>${aiStatus}</b>\n\n` +
            `📅 Підписка: <b>${sub.plan === 'free' ? 'Безстроково' : 'До ' + expiryDate}</b>`;

        const keyboard = {
            inline_keyboard: [
                [{ text: '🚀 Підвищити тариф', callback_data: 'subscription_shop' }],
                [{ text: '🏠 Меню', callback_data: 'main_menu' }]
            ]
        };

        await bot.editMessageText(profileText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: keyboard
        });

    } catch (error) {
        console.error("❌ Помилка рендеру профілю:", error.message);
    }
};

const callbackHandler = async (bot, query, sendMainMenu, callbacks) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;


    console.log(`--- НОВИЙ КЛІК: "${data}" ---`); // Це покаже, що реально приходить

    console.log(`📥 Отримано клік: ${data}`);


    if (data.startsWith('remove_tgsrc_')) {
        try {
            await bot.answerCallbackQuery(query.id).catch(e => console.log("Помилка answerCallback:", e));

            const parts = data.split('_');
            const chId = parts[2];
            const index = parseInt(parts[3]);

            const channel = await Channel.findById(chId);

            if (channel && channel.tgSources && channel.tgSources[index] !== undefined) {

                channel.tgSources.splice(index, 1);
                channel.markModified('tgSources');
                await channel.save();
                // Використовуємо query.message.message_id
                if (typeof renderSourcesList === 'function') {
                    return renderSourcesList(bot, chatId, query.message.message_id, chId);
                } else {
                    console.error("❌ ПОМИЛКА: Функція renderSourcesList не доступна.");
                }
            } else {
                console.log("⚠️ Канал не знайдено або індекс пустий");
            }
        } catch (error) {
            console.error("❌ КРИТИЧНА ПОМИЛКА:", error);
        }
    }

    if (data === 'locked_feature_ai') {
        return bot.answerCallbackQuery(query.id, {
            text: "🔒 Доступно лише на платних тарифах",
            show_alert: true
        });
    }

    if (data.startsWith('admin_')) {
        const authorized = await isAdmin(chatId);

        if (!authorized) {
            return bot.answerCallbackQuery(query.id, {
                text: "⛔ Доступ заборонено! Ви не є адміністратором.",
                show_alert: true
            });
        }
        const user = await User.findOne({ telegramId: chatId.toString() });

        if (data === 'admin_dashboard' || data === 'admin_main') {
            try {
                await bot.answerCallbackQuery(query.id).catch(() => { });

                let stats;
                try {
                    const { getAdminStats } = require('../../services/adminService');
                    stats = await getAdminStats();
                } catch (e) {
                    console.error("Помилка статистики:", e.message);
                    stats = {};
                }

                // Додаємо час оновлення (це гарантує, що текст буде іншим і помилки 400 не буде)
                const now = new Date().toLocaleTimeString('uk-UA');

                const text = `<b>📊 ГОЛОВНИЙ ДАШБОРД</b>\n` +
                    `<i>🕒 Оновлено о: ${now}</i>\n\n` +
                    `👤 <b>Користувачі:</b> ${stats.general?.totalUsers || 0}\n` +
                    `🆕 <b>Нових (24г):</b> ${stats.general?.newToday || 0}\n` +
                    `📺 <b>Канали:</b> ${stats.channels?.total || 0}\n` +
                    `📝 <b>Пости сьогодні:</b> ${stats.postsToday || 0}\n` +
                    `💎 <b>Дохід:</b> ${stats.monthlyRevenue || 0} Stars`;

                const { getAdminDashboardKeyboard } = require('../keyboards/admin');

                // ВАЖЛИВО: додаємо .catch() прямо до редагування
                return await bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: getAdminDashboardKeyboard()
                }).catch(err => {
                    // Якщо все ж таки прийшла помилка "not modified", просто відповідаємо в спливаюче вікно
                    if (err.message.includes('message is not modified')) {
                        return bot.answerCallbackQuery(query.id, { text: "Дані вже актуальні ✅" });
                    }
                    // Якщо помилка інша — "прокидаємо" її далі в основний catch
                    throw err;
                });

            } catch (err) {
                // Сюди потраплять тільки реальні помилки (наприклад, впала база або немає інтернету)
                console.error("❌ КРИТИЧНА ПОМИЛКА АДМІНКИ:", err.message);
                return bot.sendMessage(chatId, "⚠️ Сталася реальна помилка: " + err.message);
            }
        }
        if (data === 'admin_users' || data.startsWith('admin_users_page_')) {
            try {
                await bot.answerCallbackQuery(query.id).catch(() => { });

                const page = data.startsWith('admin_users_page_') ? parseInt(data.split('_')[3]) : 1;
                const { getUsersList } = require('../../services/adminService');
                const { getUsersKeyboard } = require('../keyboards/admin');

                const { users, totalPages, totalCount } = await getUsersList(page, 10);

                // Додаємо час оновлення, щоб текст ЗАВЖДИ був унікальним
                const updateTime = new Date().toLocaleTimeString('uk-UA');

                const text = `👥 <b>Управління користувачами</b>\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `Усього: <b>${totalCount}</b>\n` +
                    `Сторінка: <b>${page}/${totalPages}</b>\n` +
                    `<i>🕒 Оновлено о: ${updateTime}</i>`;

                return await bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: getUsersKeyboard(users, page, totalPages)
                }).catch(err => {
                    // Якщо дані ті самі — просто кажемо про це адміну без помилки
                    if (err.message.includes('message is not modified')) {
                        return bot.answerCallbackQuery(query.id, { text: "Дані актуальні ✅" });
                    }
                    throw err; // Всі інші помилки летять в головний catch
                });

            } catch (error) {
                console.error('❌ Помилка списку юзерів:', error.message);
                // Тепер ця плашка вискочить лише якщо реально щось впало (наприклад, база)
                return bot.answerCallbackQuery(query.id, {
                    text: "⚠️ Критична помилка: " + error.message,
                    show_alert: true
                });
            }
        }
        if (data === 'admin_user_search') {
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: 'WAITING_FOR_ADMIN_USER_SEARCH' });
            return bot.editMessageText('🔍 <b>Пошук користувача</b>\n\nВведіть @username або ID:', {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: '❌ Скасувати', callback_data: 'admin_users' }]] }
            });
        }
        if (data === 'admin_broadcast') {
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: 'ADMIN_AWAITING_BROADCAST' });
            const bcText = "📢 <b>РЕЖИМ РОЗСИЛКИ</b>\n\nНадішліть повідомлення, яке отримають всі користувачі:";
            return bot.editMessageText(bcText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: '❌ Скасувати', callback_data: 'admin_dashboard' }]] }
            });
        }
        if (data === 'admin_channels' || data.startsWith('admin_ch_page_')) {
            const page = data.startsWith('admin_ch_page_') ? parseInt(data.split('_')[3]) : 1;
            const { channels, totalPages, totalCount } = await getChannelsList(page);

            return bot.editMessageText(`📺 <b>Список усіх каналів</b> (${totalCount})\nСторінка ${page}/${totalPages}:`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: getChannelsKeyboard(channels, page, totalPages)
            });
        }
        if (data === 'admin_plans') {
            await bot.answerCallbackQuery(query.id).catch(() => { });
            const plans = await getAllPlans();

            if (!plans || plans.length === 0) {
                // Замість просто тексту даємо кнопку для ініціалізації (опціонально)
                return bot.editMessageText("⚠️ **Тарифи відсутні в базі даних.**\n\nЗапустіть скрипт ініціалізації або додайте перший тариф вручну через БД.", {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin_dashboard' }]]
                    }
                });
            }

            return bot.editMessageText("💳 **Управління тарифами**\n\nОберіть тариф для редагування ціни та лімітів:", {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: getAdminPlansKeyboard(plans)
            });
        }
        if (user && user.tempState === 'admin_awaiting_broadcast') {
            // 1. Якщо адмін хоче скасувати розсилку текстом
            if (msg.text && msg.text.toLowerCase() === 'скасувати') {
                await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: null });
                return bot.sendMessage(chatId, "❌ Розсилку скасовано.");
            }

            // 2. Викликаємо функцію розсилки (ми її створимо нижче)
            await startBroadcast(bot, chatId, msg);

            // 3. Скидаємо стан після завершення
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: null });
            return;
        }
        if (data.startsWith('admin_plan_view_')) {
            const planId = data.split('_')[3];
            return renderPlanEditCard(bot, chatId, messageId, planId);
        }
        if (data.startsWith('admin_plan_edit_') && !data.includes('_ai_')) {
            const parts = data.split('_');
            const field = parts[3]; // price, channels, posts
            const planId = parts[4];

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
        if (data.startsWith('admin_plan_edit_ai_')) {
            const planId = data.split('_')[4];

            try {
                await bot.answerCallbackQuery(query.id).catch(() => { });

                const currentPlan = await Plan.findById(planId);
                if (!currentPlan) return;

                // ВИПРАВЛЕНО: Використовуємо назву з твоєї схеми 'hasCustomPrompt'
                const fieldName = 'hasCustomPrompt';
                const newValue = !currentPlan[fieldName];

                const updatedPlan = await Plan.findByIdAndUpdate(
                    planId,
                    { $set: { [fieldName]: newValue } },
                    { returnDocument: 'after' }
                );

                // Лог тепер покаже реальне значення (true/false)
                console.log(`🔔 AI Статус для ${updatedPlan.name}: ${updatedPlan[fieldName]}`);

                // Перемальовуємо картку
                return await renderPlanEditCard(bot, chatId, messageId, planId);

            } catch (error) {
                console.error("❌ Помилка перемикача AI:", error.message);
                return bot.answerCallbackQuery(query.id, { text: "Помилка оновлення", show_alert: true });
            }
        }
        if (data.startsWith('admin_ch_view_')) {
            const chId = data.split('_')[3];
            const channel = await Channel.findById(chId).populate('userId');

            const text = `
📺 <b>Канал:</b> ${channel.name}
🆔 <b>ID:</b> <code>${channel.channelId}</code>
👤 <b>Власник:</b> @${channel.userId?.username || 'unknown'} (<code>${channel.userId?.telegramId}</code>)
📊 <b>Джерела:</b> RSS: ${channel.rssSources?.length || 0}, JSON: ${channel.jsonSources?.length || 0}
⚙️ <b>Статус:</b> ${channel.isActive ? '✅ Активний' : '⏸ Неактивний'}
📅 <b>Створено:</b> ${channel.createdAt?.toLocaleDateString()}
🕒 <b>Остання перевірка:</b> ${channel.lastCheckedAt ? channel.lastCheckedAt.toLocaleString() : 'Ніколи'}

🤖 <b>AI Промпт:</b>
<code>${channel.customPrompt || 'Стандартний'}</code>
    `;

            return bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: getChannelAdminControlKeyboard(chId, channel.isActive)
            });
        }
        if (data.startsWith('admin_ch_sources_')) {
            const chId = data.replace('admin_ch_sources_', '');
            try {
                const channel = await Channel.findById(chId);
                if (!channel) {
                    // Використовуй ту назву змінної, яка приходить у callbackHandler (зазвичай query або cb)
                    return await bot.answerCallbackQuery(query.id, { text: "Канал не знайдено" });
                }

                const jsonSrc = channel.jsonSources || [];
                const tgSrc = channel.tgSources || [];

                await bot.editMessageText(`📂 *Керування джерелами*`, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: getChannelSourcesKeyboard(chId, jsonSrc, tgSrc) // Тепер вона визначена
                });
            } catch (err) {
                console.error("Error in admin_ch_sources:", err);
                // ВИПРАВЛЕНО: перевір, як називається аргумент функції. 
                // Якщо у тебе callbackHandler = async (query) => ..., то пиши query.id
                try {
                    await bot.answerCallbackQuery(query.id, { text: "Сталася помилка" });
                } catch (e) {
                    console.log("Додаткова помилка при спробі відповісти на колбек");
                }
            }
        }

        // 1. ПЕРЕГЛЯД ПЕРЕД ВИДАЛЕННЯМ
        if (data.startsWith('admin_src_view_')) {
            const parts = data.split('_');
            const type = parts[3];
            const chId = parts[4];
            const index = parseInt(parts[5]);

            try {
                const channel = await Channel.findById(chId);
                const source = type === 'tg' ? channel.tgSources[index] : channel.jsonSources[index];

                if (!source) return await bot.answerCallbackQuery(query.id, { text: "Джерело не знайдено" });

                // Використовуємо HTML, він менш чутливий до символів підкреслення
                const messageText = `<b>ℹ️ Деталі джерела (${type.toUpperCase()})</b>\n\n` +
                    `🔗 <code>${source.url}</code>`;

                await bot.editMessageText(messageText, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML', // Змінено на HTML
                    reply_markup: getSourceConfirmKeyboard(chId, type, index)
                });
            } catch (err) {
                console.error("Error in view source:", err);
                await bot.answerCallbackQuery(query.id, { text: "Помилка відображення" });
            }
        }

        // 2. ОСТАТОЧНЕ ВИДАЛЕННЯ (виправлений шлях до ID)
        if (data.startsWith('admin_src_del_')) {
            const parts = data.split('_'); // admin(0)_src(1)_del(2)_type(3)_chId(4)_index(5)
            const type = parts[3];
            const chId = parts[4];
            const index = parseInt(parts[5]);

            const channel = await Channel.findById(chId);
            if (type === 'tg') channel.tgSources.splice(index, 1);
            else channel.jsonSources.splice(index, 1);

            await channel.save();
            await bot.answerCallbackQuery(query.id, { text: "Видалено успішно" });

            // Повертаємо користувача до оновленого списку джерел
            await bot.editMessageText(`📂 <b>Керування джерелами</b>`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML', // Використовуй HTML скрізь для стабільності
                reply_markup: getChannelSourcesKeyboard(chId, channel.jsonSources, channel.tgSources)
            });
        }
        if (data.startsWith('admin_ch_force_')) {
            const chId = data.split('_')[3];
            const channel = await Channel.findById(chId);

            bot.answerCallbackQuery(query.id, { text: "⏳ Запускаю перевірку..." });

            // Запускаємо логіку збору новин
            await processSingleChannel(bot, channel);

            bot.sendMessage(chatId, `✅ Перевірка каналу <b>${channel.name}</b> завершена.`, { parse_mode: 'HTML' });
        }
        if (data.startsWith('admin_ch_delete_confirm_')) {
            const chId = data.split('_')[4];
            return bot.editMessageText("❓ Ви впевнені, що хочете видалити цей канал та всі його джерела?", {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Так, видалити', callback_data: `admin_ch_delete_final_${chId}` }],
                        [{ text: '❌ Ні, скасувати', callback_data: `admin_ch_view_${chId}` }]
                    ]
                }
            });
        }
        if (data.startsWith('admin_ch_delete_final_')) {
            const chId = data.split('_')[4];
            await Channel.findByIdAndDelete(chId);
            return bot.editMessageText("✅ Канал успішно видалено.", {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: [[{ text: '⬅️ До списку', callback_data: 'admin_channels' }]] }
            });
        }
        if (data.startsWith('admin_user_view_')) {
            try {
                const userId = data.split('_')[3];
                const targetUser = await User.findById(userId);

                if (!targetUser) {
                    return bot.answerCallbackQuery(query.id, { text: "❌ Користувача не знайдено", show_alert: true });
                }

                // Отримуємо кількість каналів
                const channelCount = await Channel.countDocuments({ ownerId: targetUser.telegramId });

                // --- ГЕНЕРУЄМО ЧАС ОНОВЛЕННЯ ---
                const now = new Date();
                const timestamp = now.toLocaleTimeString('uk-UA');

                let text = `👤 <b>Картка користувача</b>\n`;
                text += `━━━━━━━━━━━━━━━━━━\n`;
                text += `<b>Ім'я:</b> ${targetUser.username || 'Немає'}\n`;
                text += `<b>ID:</b> <code>${targetUser.telegramId}</code>\n`;
                text += `<b>Роль:</b> ${targetUser.role === 'admin' ? '⭐ Адмін' : '👤 Юзер'}\n`;
                text += `<b>Статус:</b> ${targetUser.isBlocked ? '🚫 Заблокований' : '✅ Активний'}\n`;
                text += `━━━━━━━━━━━━━━━━━━\n`;
                text += `<b>Тариф:</b> ${targetUser.subscription?.plan?.toUpperCase() || 'FREE'}\n`;
                text += `<b>Каналів:</b> ${channelCount}\n`;
                text += `<b>Реєстрація:</b> ${new Date(targetUser.createdAt).toLocaleDateString('uk-UA')}\n`;
                text += `━━━━━━━━━━━━━━━━━━\n`;
                text += `🕒 <i>Оновлено: ${timestamp}</i>`; // Цей рядок робить повідомлення унікальним

                return bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: getUserManageKeyboard(targetUser._id, targetUser.isBlocked)
                }).catch(err => {
                    // Перехоплюємо помилку, якщо раптом клікнули занадто швидко
                    if (!err.message.includes("message is not modified")) {
                        console.error("Edit Card Error:", err.message);
                    }
                });
            } catch (error) {
                console.error("View user error:", error);
                return bot.answerCallbackQuery(query.id, { text: "⚠️ Помилка завантаження даних" });
            }
        }
        if (data.startsWith('admin_user_delete_')) {
            const userId = data.split('_')[3];

            // Видаляємо самого юзера
            await User.findByIdAndDelete(userId);
            // Видаляємо всі його канали
            await Channel.deleteMany({ userId: userId });

            await bot.answerCallbackQuery(query.id, { text: "Користувача та його канали видалено 🗑", show_alert: true });
            // Повертаємося до загального списку
            return callbackHandler(bot, { ...query, data: 'admin_users' }, sendMainMenu);
        }
        if (data.startsWith('admin_user_plan_')) {
            const userId = data.split('_')[3];
            const plans = ['free', 'basic', 'pro', 'business'];

            const buttons = plans.map(plan => ([{
                text: plan.toUpperCase(),
                callback_data: `admin_set_plan_${plan}_${userId}`
            }]));
            buttons.push([{ text: '🔙 Назад до картки', callback_data: `admin_user_view_${userId}` }]);

            return bot.editMessageText('💎 <b>Оберіть новий тариф для користувача:</b>', {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: buttons }
            });
        }
        if (data.startsWith('admin_set_plan_')) {
            try {
                // Уважно перевіряємо split. 
                // Якщо кнопка: admin_set_plan_pro_ID, то:
                // parts[0]=admin, [1]=set, [2]=plan, [3]=pro, [4]=ID
                const parts = data.split('_');
                const planName = parts[3];
                const userId = parts[4];

                // Використовуємо PLANS, бо саме так ти його імпортував (const PLANS = require(...))
                const planConfig = PLANS[planName];

                if (!planConfig) {
                    console.error(`Plan ${planName} not found in config`);
                    return bot.answerCallbackQuery(query.id, { text: "❌ Конфігурацію тарифу не знайдено" });
                }

                // Оновлюємо базу
                await User.findByIdAndUpdate(userId, {
                    $set: {
                        'subscription.plan': planName,
                        'subscription.maxChannels': planConfig.maxChannels,
                        'subscription.maxPostsPerDay': planConfig.maxPostsPerDay,
                        'subscription.canCustomPrompt': planConfig.canCustomPrompt,
                        'subscription.expiresAt': planName === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                        'subscription.reminded': false
                    }
                });

                await bot.answerCallbackQuery(query.id, {
                    text: `✅ Тариф ${planName.toUpperCase()} активовано.\nПромпт: ${planConfig.customPromptAllowed ? 'Доступний' : 'Вимкнено'}`,
                    show_alert: true
                });

                // Повертаємо адміна до картки користувача
                // Переконайся, що callbackHandler доступний у цьому контексті
                return callbackHandler(bot, { ...query, data: `admin_user_view_${userId}` }, sendMainMenu);

            } catch (error) {
                console.error("Admin Set Plan Error:", error);
                return bot.answerCallbackQuery(query.id, { text: "⚠️ Помилка оновлення бази" });
            }
        }
        if (data.startsWith('admin_bc_target_')) {
            const target = data.split('_')[3];
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, {
                tempState: 'WAITING_BC_TEXT',
                tempData: { target }
            });

            return bot.editMessageText("📝 Надішліть текст повідомлення для розсилки (можна використовувати HTML):", {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: [[{ text: '❌ Скасувати', callback_data: 'admin_broadcast' }]] }
            });
        }
        if (data === 'admin_bc_confirm_yes') {
            const user = await User.findOne({ telegramId: chatId.toString() });
            const { text, target, button } = user.tempData;

            // Очищаємо стан, щоб адмін міг працювати далі
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: null });

            // Запускаємо фоновий процес (без await, щоб не блокувати адміна)
            const { startBroadcast } = require('../../services/broadcastService');
            startBroadcast(bot, chatId, { text, target, button });

            return bot.editMessageText("✅ Розсилка запущена в фоновому режимі.", { chat_id: chatId, message_id: messageId });
        }
        if (data === 'admin_logs_errors') {
            const errors = await Log.find({ type: 'ERROR' }).sort({ createdAt: -1 }).limit(10);

            let text = "❌ <b>Останні помилки:</b>\n\n";
            if (errors.length === 0) text += "Помилок не знайдено.";

            errors.forEach(err => {
                text += `🕒 ${err.createdAt.toLocaleString()}\n💬 ${err.details}\n---\n`;
            });

            return bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin_main' }]] }
            });
        }
        if (data === 'admin_export_users') {
            const csvBuffer = await exportUsersToCSV();

            await bot.answerCallbackQuery(query.id, { text: "Генерую файл..." });

            return bot.sendDocument(chatId, csvBuffer, {
                caption: "📊 Список користувачів (CSV)",
            }, {
                filename: `users_export_${new Date().toLocaleDateString()}.csv`,
                contentType: 'text/csv'
            });
        }
        if (data.startsWith('admin_user_delete_request_')) {
            const userId = data.split('_')[4];
            return bot.editMessageText("⚠️ <b>УВАГА!</b>\nВи намагаєтесь видалити користувача. Це видалить всі його канали та дані. Ви впевнені?", {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: getConfirmKeyboard('deleteUser', userId)
            });
        }
        if (data === 'admin_bc_start_final') {
            try {
                const admin = await User.findOne({ telegramId: chatId.toString() });
                const { broadcastMsgId, broadcastFromChatId } = admin.tempData;

                if (!broadcastMsgId) {
                    return bot.sendMessage(chatId, "❌ Помилка: повідомлення для розсилки не знайдено.");
                }

                const allUsers = await User.find({ isBlocked: { $ne: true } });
                let successCount = 0;

                await bot.sendMessage(chatId, `🚀 Розсилка розпочата для ${allUsers.length} юзерів...`);

                for (const targetUser of allUsers) {
                    try {
                        // copyMessage копіює ВСЕ: фото, опис, кнопки, посилання
                        await bot.copyMessage(targetUser.telegramId, broadcastFromChatId, broadcastMsgId);
                        successCount++;
                    } catch (err) {
                        console.log(`Не вдалося відправити юзеру ${targetUser.telegramId}`);
                    }
                    // Затримка, щоб Telegram не забанив за спам (20 повідомлень на секунду — безпечно)
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                // Очищаємо стан адміна
                await User.findOneAndUpdate({ telegramId: chatId.toString() }, { tempState: null, tempData: {} });

                return bot.sendMessage(chatId, `✅ <b>Розсилку завершено!</b>\nДоставлено: ${successCount} користувачам.`, { parse_mode: 'HTML' });

            } catch (err) {
                console.error("Broadcast Exec Error:", err);
                bot.sendMessage(chatId, "⚠️ Сталася помилка під час виконання розсилки.");
            }
        }
        return;
    }

    await bot.answerCallbackQuery(query.id).catch(() => { });

    try {

        const User = require('../../models/User'); // Переконайся, що шлях вірний
        const user = await User.findOne({ telegramId: chatId.toString() });

        if (!user) return;

        if (data === 'main_menu') {
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { 'tempData.lastMenu': 'main_menu' });
            return sendMainMenu(chatId, messageId);
        }
        // --- WIZARD LOGIC ---
        // --- WIZARD LOGIC ---
        if (data === 'start_wizard') {
            // Б1: Підраховуємо існуючі канали користувача (незалежно від isActive)
            const userChannelsCount = await Channel.countDocuments({ userId: user._id });

            // Б2: Порівнюємо з лімітом у підписці (для Free це 1)
            if (userChannelsCount >= user.subscription.maxChannels) {
                // Б3: Повідомлення про вичерпання ліміту
                return bot.editMessageText(
                    `⚠️ <b>Ліміт вичерпано</b>\n\n` +
                    `Ви досягли ліміту вашого тарифу <b>${user.subscription.plan.toUpperCase()}</b>: ` +
                    `максимум ${user.subscription.maxChannels} канал(ів).\n\n` +
                    `Ви можете видалити існуючий канал або оновити тарифний план у профілі.`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '👤 Мій профіль (скоро)', callback_data: 'my_profile' }],
                                [{ text: '🏠 Меню', callback_data: 'main_menu' }]
                            ]
                        }
                    }
                );
            }

            // Якщо ліміт не перевищено — запускаємо стандартний візард
            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                { tempState: 'STEP_1_NAME', lastMenuMessageId: messageId, tempData: {} }
            );

            const text =
                `🚀 **Створення нового проєкту**\n` +
                `________________________________\n\n` +
                `📝 **Крок 1 з 2: Дайте назву**\n\n` +
                `Ця назва буде відображатися лише у вашому списку проєктів.\n\n` +
                `👇 **Введіть назву прямо зараз:**`;

            return bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Скасувати', callback_data: 'main_menu' }]]
                }
            });
        }

        if (data.startsWith('set_int_')) {
            const parts = data.split('_');
            await Channel.findByIdAndUpdate(parts[2], { checkInterval: parseInt(parts[3]) });
            // ✅ callbacks. замість прямого виклику
            return callbacks.showChannelSettings(chatId, parts[2], messageId, user);
        }
        // --- CHANNELS LIST ---
        if (data === 'list_channels') {
            const channels = await Channel.find({ userId: user._id });
            if (channels.length === 0) {
                return bot.editMessageText("📊 <b>Список порожній.</b>", {
                    chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '➕ Створити проект', callback_data: 'start_wizard' }],
                            [{ text: '🏠 Меню', callback_data: 'main_menu' }]
                        ]
                    }
                });
            }
            const keyboard = channels.map(ch => ([{
                text: `📺 ${ch.channelUsername || "Без назви"} (/${ch.checkInterval}хв)`,
                callback_data: `manage_${ch._id}`
            }]));
            keyboard.push([{ text: '🚀 Перевірити всі зараз', callback_data: 'force_check_all' }]);
            keyboard.push([{ text: '⬅️ Назад', callback_data: 'main_menu' }]);
            return bot.editMessageText("📊 <b>Ваші канали:</b>", {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard }
            });
        }
        if (data.startsWith('manage_')) {
            const channelId = data.split('_')[1];

            await bot.answerCallbackQuery(query.id).catch(e => { });

            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                { lastMenuMessageId: messageId }
            );

            if (callbacks && typeof callbacks.showChannelSettings === 'function') {
                return callbacks.showChannelSettings(chatId, channelId, messageId, user);
            }
        }

        // === НОВИЙ БЛОК ДЛЯ ПЕРЕМИКАННЯ СТАТУСУ (АКТИВОВАНИЙ/НЕАКТИВОВАНИЙ) ===
if (data.startsWith('admin_ch_toggle_')) {
    const channelId = data.replace('admin_ch_toggle_', '');
    await bot.answerCallbackQuery(query.id).catch(() => {});

    try {
        const channel = await Channel.findById(channelId);
        if (!channel) return;

        // МІНЯЄМО СТАТУС
        channel.isEnabled = !channel.isEnabled;
        await channel.save();

        // ОНОВЛЮЄМО МЕНЮ
        await showChannelSettings(chatId, channelId, messageId, user);
        
    } catch (e) {
        console.error("🔴 Toggle Error:", e.message);
    }
}

        // --- НОВЕ: МЕНЮ ДЖЕРЕЛ ---
        if (data.startsWith('sources_list_')) {
            const chId = data.slice(13);
            if (!chId || chId.length !== 24) {
                console.error("❌ Помилка: sources_list_ отримав невалідний ID:", chId);
                return bot.answerCallbackQuery(query.id, { text: "⚠️ Помилка ID" });
            }
            return renderSourcesList(bot, chatId, messageId, chId);
        }

        if (data.startsWith('remove_rss_')) {
            const [, , chId, index] = data.split('_');
            const ch = await Channel.findById(chId);
            if (ch) {
                ch.rssUrls.splice(parseInt(index), 1);
                await ch.save(); // [cite: 279]
                await bot.answerCallbackQuery(query.id, { text: "RSS видалено" });
                return renderSourcesList(bot, chatId, messageId, chId);
            }
        }

        if (data.startsWith('remove_json_')) {
            const [, , chId, index] = data.split('_');
            const ch = await Channel.findById(chId);
            if (ch) {
                ch.jsonSources.splice(parseInt(index), 1);
                await ch.save(); // [cite: 279]
                await bot.answerCallbackQuery(query.id, { text: "JSON джерело видалено" });
                return renderSourcesList(bot, chatId, messageId, chId);
            }
        }

        if (data.startsWith('edit_interval_')) {
            const chId = data.slice(14);
            return bot.editMessageText("⏱ <b>Змінити інтервал</b>", {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: { inline_keyboard: getIntervalKeyboard(chId) }
            });
        }
        if (data.startsWith('check_one_')) {
            const ch = await Channel.findById(data.slice(10));
            if (!ch) return;
            await bot.sendMessage(chatId, `⏳ Перевіряю <b>${ch.channelUsername}</b>...`, { parse_mode: 'HTML' });
            await processSingleChannel(bot, ch);
            return bot.sendMessage(chatId, "✅ Готово!");
        }

        if (data === 'force_check_all') {
            await bot.sendMessage(chatId, "🚀 <b>Запуск перевірки всіх...</b>", { parse_mode: 'HTML' });
            await processNews(bot, user._id);
            return bot.sendMessage(chatId, "✅ Перевірку завершено!");
        }

        // 1. Користувач натиснув "Видалити канал" (Показуємо підтвердження)
        if (data.startsWith('del_')) {
            const chId = data.slice(4); // Отримуємо ID каналу
            const text = `⚠️ <b>Підтвердження видалення</b>\n\n` +
                `Ви дійсно хочете видалити цей канал? Всі підключені джерела та налаштування AI будуть втрачені назавжди.`;

            const keyboard = [
                [{ text: '🗑 Так, видалити остаточно', callback_data: `confirm_del_${chId}` }],
                [{ text: '⬅️ Ні, я передумав', callback_data: `manage_${chId}` }]
            ];

            return bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        }

        // 2. Фінальне підтвердження (Тут відбувається реальне видалення)
        if (data.startsWith('confirm_del_')) {
            const chId = data.slice(12); // "confirm_del_" - це 12 символів

            try {
                await Channel.findByIdAndDelete(chId);

                // Спливаюче повідомлення зверху екрана
                await bot.answerCallbackQuery(query.id, { text: "✅ Канал успішно видалено" });

                // Повертаємо користувача в головне меню
                return sendMainMenu(chatId, messageId);
            } catch (err) {
                console.error("❌ Помилка при видаленні каналу:", err.message);
                await bot.answerCallbackQuery(query.id, { text: "❌ Помилка бази даних", show_alert: true });
            }
        }
        if (data.startsWith('add_rss_')) {
            const id = data.slice(8);
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, {
                tempState: 'WAITING_FOR_RSS', 'tempData.editingChannelId': id, lastMenuMessageId: messageId
            });
            return bot.editMessageText("🌐 Введіть нове RSS-посилання:", {
                chat_id: chatId, message_id: messageId, ...cancelMenu(`sources_list_${id}`) // Повертаємо до списку джерел
            });
        }
        if (data.startsWith('add_tgsrc_')) {
            const channelId = data.split('_')[2]; // Витягуємо ID твого каналу з БД

            try {
                const User = require('../../models/User'); // Переконайся, що шлях до моделі вірний

                // 1. Встановлюємо стан очікування посилання
                await User.findOneAndUpdate(
                    { telegramId: chatId.toString() },
                    {
                        tempState: 'WAITING_TG_SOURCE',
                        tempData: { targetChannelId: channelId }
                    }
                );

                // 2. Відповідаємо користувачу
                return bot.sendMessage(chatId,
                    "📱 <b>Додавання Telegram-джерела</b>\n\n" +
                    "Надішліть посилання на канал, за яким треба стежити.\n\n" +
                    "Приклади:\n" +
                    "• <code>https://t.me/username</code>\n" +
                    "• <code>@username</code>\n\n" +
                    "<i>Бот буде автоматично робити рерайт нових постів з цього каналу.</i>",
                    { parse_mode: 'HTML' }
                );
            } catch (err) {
                console.error("Помилка при натисканні add_tgsrc:", err.message);
                return bot.answerCallbackQuery(query.id, { text: "❌ Помилка бази даних" });
            }
        }
        if (data.startsWith('add_json_') && !data.startsWith('add_json_back_')) {
            // ✅ Беремо все після 'add_json_' як ID (замість split який ламається)
            const channelId = data.replace('add_json_', '');

            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                {
                    tempState: 'WAITING_FOR_JSON',
                    tempData: { editingChannelId: channelId, menuMessageId: messageId }
                }
            );

            return bot.sendMessage(chatId, "🌐 <b>Введіть посилання на JSON-джерело:</b>", { parse_mode: 'HTML' });
        }
        // Кнопка "Спробувати ще раз"
        if (data.startsWith('retry_json_')) {
            const channelId = data.replace('retry_json_', '');

            // ✅ Видаляємо повідомлення з помилкою
            const errorMsgId = user.tempData?.errorMsgId;
            if (errorMsgId) {
                bot.deleteMessage(chatId, errorMsgId).catch(() => { });
            }

            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                {
                    tempState: 'WAITING_FOR_JSON',
                    tempData: { editingChannelId: channelId, menuMessageId: messageId }
                }
            );

            await bot.answerCallbackQuery(query.id);

            return bot.sendMessage(chatId,
                "🌐 <b>Введіть посилання на JSON-джерело:</b>",
                { parse_mode: 'HTML' }
            );
        }

        // Кнопка "Назад"
        if (data.startsWith('add_json_back_')) {
            const channelId = data.replace('add_json_back_', '');

            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                { tempState: null, tempData: {} }
            );

            // ✅ query.id замість callbackQuery.id
            await bot.answerCallbackQuery(query.id);

            if (callbacks && typeof callbacks.showChannelSettings === 'function') {
                return callbacks.showChannelSettings(chatId, channelId, messageId, user);
            }
        }
        if (data.startsWith('edit_prompt_')) {
            const channelId = data.replace('edit_prompt_', '');

            // 1. Отримуємо свіжі дані юзера
            const freshUser = await User.findOne({ telegramId: chatId.toString() });
            const ch = await Channel.findById(channelId);

            if (!ch || !freshUser) return;

            // 2. ПЕРЕВІРКА (Така ж, як у кнопці): 
            // Якщо не free, то пускаємо, навіть якщо в базі undefined
            const plan = freshUser.subscription?.plan || 'free';
            const canEdit = freshUser.role === 'admin' ||
                freshUser.subscription?.hasCustomPrompt === true ||
                (plan !== 'free' && plan !== 'FREE');

            if (!canEdit) {
                // Текст для безкоштовних юзерів
                const text = `⚠️ <b>Зміна AI промпту обмежена</b>\n\n` +
                    `На тарифі <b>FREE</b> використовується стандартний алгоритм обробки новин.\n` +
                    `Власні промпти доступні лише у платних тарифах.`;

                return bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🚀 Оновити тариф', callback_data: 'subscription_shop' }],
                            [{ text: '🔙 Назад до каналу', callback_data: `manage_${channelId}` }]
                        ]
                    }
                });
            }

            // 3. ЯКЩО ДОСТУП Є (Твій BASIC)
            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                { 'tempData.editingChannelId': channelId }
            );

            // Викликаємо рендерер, який ти показував раніше
            return renderPromptSettings(bot, chatId, messageId, channelId);
        }
        // Користувач натиснув кнопку "✏️ Змінити промпт"
        if (data.startsWith('start_edit_prompt_')) {
            const channelId = data.replace('start_edit_prompt_', '');
            const ch = await Channel.findById(channelId);

            if (!ch) return;

            // 1. Перемикаємо юзера в режим очікування тексту
            // Ми запам'ятовуємо, який саме канал редагуємо
            await User.findOneAndUpdate(
                { telegramId: chatId.toString() },
                {
                    tempState: 'EDIT_PROMPT',
                    'tempData.editingChannelId': channelId
                }
            );

            // 2. Змінюємо текст повідомлення на інструкцію
            const text = `📝 <b>Редагування промпту</b>\n\n` +
                `Канал: <b>${ch.channelUsername}</b>\n\n` +
                `Будь ласка, <b>напишіть та відправте</b> новий текст промпту у цей чат.\n\n` +
                `<i>Підказка: Опишіть, у якому стилі AI має робити рерайт (наприклад: "пиши професійно", "використовуй молодіжний сленг" тощо).</i>`;

            return await bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌ Скасувати', callback_data: `edit_prompt_${channelId}` }]
                    ]
                }
            });
        }
        // Крок 4: Скидання промпту
        if (data.startsWith('reset_prompt_')) {
            const chId = data.slice(13);
            await Channel.findByIdAndUpdate(chId, { aiPrompt: null });
            await bot.answerCallbackQuery(query.id, { text: "✅ Промпт скинуто до стандартного" });
            return renderPromptSettings(bot, chatId, messageId, chId);
        }

        if (data === 'subscription_shop') {
            return renderSubscriptionShop(bot, chatId, messageId, 'main_menu');
        }

        if (data === 'upgrade_plan') {
            return renderSubscriptionShop(bot, chatId, messageId, 'my_profile');
        }
        // 3. Сам профіль
        if (data === 'my_profile') {
            await User.findOneAndUpdate({ telegramId: chatId.toString() }, { 'tempData.lastMenu': 'my_profile' });
            return renderProfile(bot, chatId, messageId, user, query.id);
        }

        // Обробка натискання на конкретний тариф
        if (data.startsWith('buy_plan_')) {
            const planName = data.split('_')[2];

            try {
                const plan = await Plan.findOne({ name: planName });
                if (!plan) return bot.answerCallbackQuery(query.id, { text: "Тариф не знайдено" });

                // ВАЖЛИВО: Перевіряємо, чи ціна не 0 (для FREE інвойс не потрібен)
                if (plan.price <= 0) {
                    return bot.answerCallbackQuery(query.id, { text: "Цей тариф безкоштовний" });
                }

                console.log(`💳 Спроба оплати: ${plan.displayName} за ${plan.price} Stars`);

                // ПОРЯДОК АРГУМЕНТІВ (Дуже важливо!):
                // 1. chatId
                // 2. Назва (Title)
                // 3. Опис (Description)
                // 4. Payload (для обробки після оплати)
                // 5. Provider Token (Для зірок — ЗАВЖДИ ПОРОЖНЬО '')
                // 6. Валюта (Для зірок — ЗАВЖДИ 'XTR')
                // 7. Масив цін (Prices)

                return await bot.sendInvoice(
                    chatId,
                    `Тариф ${plan.displayName}`,
                    `Доступ до ${plan.maxChannels} к-лів та ${plan.maxPostsPerDay} постів/день`,
                    `plan_payment_${planName}_${chatId}`,
                    '',      // <--- 5. ПРОВАЙДЕР ТОКЕН (Порожньо для Stars)
                    'XTR',   // <--- 6. ВАЛЮТА (Stars)
                    [
                        { label: `Купівля ${plan.displayName}`, amount: plan.price }
                    ]
                );

            } catch (err) {
                console.error("❌ ПОМИЛКА ІНВОЙСУ:", err.message);
                return bot.answerCallbackQuery(query.id, { text: "⚠️ Помилка створення рахунку", show_alert: true });
            }
        }

        if (!user || user.role !== 'admin') {
            return bot.answerCallbackQuery(query.id, { text: "⛔ Доступ заборонено", show_alert: true });
        }




        // Повернення в головне меню
        if (data === 'main_menu_exit') {
            await bot.answerCallbackQuery(query.id).catch(() => { });
            // Викликаємо меню, передаючи messageId для редагування
            return sendMainMenu(chatId, messageId);
        }



        if (data.startsWith('confirm_yes_')) {
            const [, , action, targetId] = data.split('_');
            const admin = await User.findOne({ telegramId: chatId.toString() });

            if (action === 'deleteUser') {
                const targetUser = await User.findById(targetId);

                // Видаляємо дані
                await Channel.deleteMany({ userId: targetId });
                await User.findByIdAndDelete(targetId);

                // Ж3: Фіксуємо дію
                await logAdminAction(
                    admin._id,
                    'DELETE_USER',
                    `Адмін ${admin.username} видалив користувача з ID ${targetId}`,
                    { targetUserId: targetId }
                );

                return bot.editMessageText("✅ Користувача та його канали успішно видалено.", {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: '⬅️ До списку', callback_data: 'admin_users' }]] }
                });
            }
        }


        // 2. Обробка входу в налаштування каналу
        if (data.startsWith('menu_settings_')) {
            try {
                const channelId = data.split('_')[2];

                // Отримуємо СВІЖІ дані юзера з бази (щоб перевірити customPromptAllowed)
                // Використовуємо toString(), бо в базі telegramId часто зберігається як рядок
                const currentUser = await User.findOne({ telegramId: chatId.toString() });
                const channel = await Channel.findById(channelId);

                if (!channel) {
                    return bot.answerCallbackQuery(query.id, { text: "❌ Канал не знайдено" });
                }

                // Рендеримо меню. getChannelSettingsKeyboard тепер отримає актуальний статус підписки
                return bot.editMessageText(`⚙️ <b>Налаштування каналу:</b> ${channel.name}`, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: getChannelSettingsKeyboard(channel, currentUser)
                    }
                });
            } catch (error) {
                console.error("Menu settings error:", error);
                return bot.answerCallbackQuery(query.id, { text: "⚠️ Помилка завантаження налаштувань" });
            }
        }
        if (data.startsWith('toggle_status_')) {
            try {
                const channelId = data.replace('toggle_status_', '');

                // 1. Знаходимо запис у базі
                const channel = await Channel.findById(channelId);
                if (!channel) {
                    return ctx.answerCbQuery("Помилка: Проєкт не знайдено", { show_alert: true });
                }

                // 2. Змінюємо статус на протилежний
                channel.isActive = !channel.isActive;
                await channel.save();

                // 3. Генеруємо нову клавіатуру через ТВОЮ функцію
                const newKeyboard = getChannelManageKeyboard(channel);

                // 4. Просто перезаписуємо всю клавіатуру
                await ctx.editMessageReplyMarkup(newKeyboard);

                // 5. Відповідаємо Telegram
                await ctx.answerCbQuery(`Статус: ${channel.isActive ? 'Активований' : 'Неактивований'}`);

            } catch (error) {
                console.error("Помилка перемикання статусу:", error);
                ctx.answerCbQuery("Сталася помилка при оновленні статусу.");
            }
        }

    } catch (e) {
        console.error("Callback Module Error:", e.message);
    }
};


module.exports = {
    renderPromptSettings,
    renderSourcesList,
    callbackHandler
};