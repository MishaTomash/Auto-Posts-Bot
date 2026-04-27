// bot/callbacks/ui_renderers.js

const User = require('../../models/User');
const Channel = require('../../models/Channel');
const Plan = require('../../models/Plan');
const { DEFAULT_PROMPT } = require('../../services/aiService');
const { getAdminStats } = require('../../services/adminService');

// Імпорт клавіатур
const { getChannelSettingsKeyboard, getIntervalKeyboard } = require('../keyboards/channel');
const {
    getAdminDashboardKeyboard,
    getPlanEditKeyboard,
    getChannelAdminControlKeyboard,
    getChannelSourcesKeyboard,
    getSourceConfirmKeyboard
} = require('../keyboards/admin');



const escapeHTML = (str) => {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

const renderPromptSettings = async (bot, chatId, messageId, chId) => {
    try {
        const ch = await Channel.findById(chId);
        if (!ch) return;

        // Перевіряємо, чи є в базі кастомний текст
        const isCustom = ch.aiPrompt !== null && ch.aiPrompt !== undefined;

        // Визначаємо, який текст показати в меню
        const rawPrompt = isCustom ? ch.aiPrompt : DEFAULT_PROMPT;
        const safePrompt = escapeHTML(rawPrompt);

        const statusLabel = isCustom ? "🟡 Кастомний" : "🟢 Стандартний"; // Змінюємо тут

        const text = `🤖 <b>Налаштування AI Промпту</b>\n\n` +
            `Статус: ${statusLabel}\n\n` +
            `<b>Текст промпту:</b>\n<code>${safePrompt}</code>`;

        const keyboard = [];

        // Кнопка зміни є завжди
        keyboard.push([{ text: '✏️ Змінити промпт', callback_data: `start_edit_prompt_${chId}` }]);

        // Кнопка "Скинути" показується ТІЛЬКИ якщо зараз стоїть кастомний текст
        if (isCustom) {
            keyboard.push([{ text: '🔄 Скинути до стандартного', callback_data: `reset_prompt_${chId}` }]);
        }

        keyboard.push([{ text: '⬅️ Назад до налаштувань', callback_data: `manage_${chId}` }]);

        const options = {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        };

        if (messageId) {
            return await bot.editMessageText(text, options);
        } else {
            return await bot.sendMessage(chatId, text, options);
        }
    } catch (error) {
        console.error("❌ Помилка в renderPromptSettings:", error);
    }
};

const renderPlanEditCard = async (bot, chatId, messageId, planId) => {
    try {
        const plan = await Plan.findById(planId);
        if (!plan) return;

        const now = new Date().toLocaleTimeString('uk-UA');
        const isAiEnabled = !!plan.hasCustomPrompt;

        const text = `⚙️ <b>Налаштування тарифу: ${plan.name.toUpperCase()}</b>\n\n` +
            `💰 Ціна: <b>${plan.price} Stars</b>\n` +
            `📺 Макс. каналів: <b>${plan.maxChannels}</b>\n` +
            `📝 Постів на день: <b>${plan.maxPostsPerDay}</b>\n` +
            `🤖 Custom AI Промпт: <b>${isAiEnabled ? '✅ Увімкнено' : '❌ Вимкнено'}</b>\n\n` +
            `<i>🕒 Останнє оновлення: ${now}</i>`;

        return await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getPlanEditKeyboard(planId, isAiEnabled)
        }).catch(err => {
            if (!err.message.includes('message is not modified')) console.error("Render Error:", err.message);
        });
    } catch (err) {
        console.error("Critical Render Error:", err);
    }
};

const renderSubscriptionShop = async (bot, chatId, messageId, backTarget) => {
    const allPlans = await Plan.find({ isActive: true }).sort({ price: 1 });
    const user = await User.findOne({ telegramId: chatId.toString() });

    const freePlan = allPlans.find(p => p.name === 'free');
    const paidPlans = allPlans.filter(p => p.name !== 'free');
    const userCurrentPlan = user?.subscription?.plan || 'free';

    let message = "💎 **ОБЕРІТЬ ТАРИФ**\n━━━━━━━━━━━━━━━━━━━━━━\n";

    if (freePlan) {
        message += `⭐️ **${freePlan.displayName}** — Безкоштовно\n` +
            `• Каналів: ${freePlan.maxChannels}\n` +
            `• Постів на день: ${freePlan.maxPostsPerDay}\n` +
            `• AI Промпт: ❌\n\n`;
    }

    const keyboard = { inline_keyboard: [] };

    for (const plan of paidPlans) {
        const title = plan.displayName || plan.name.toUpperCase();
        const price = plan.price ?? 0;
        message += `⭐️ **${title}** — ${price} Stars\n` +
            `• Каналів: ${plan.maxChannels}\n` +
            `• Постів на день: ${plan.maxPostsPerDay}\n` +
            `• AI Промпт: ${plan.hasCustomPrompt ? '✅' : '❌'}\n\n`;

        const isCurrent = plan.name === userCurrentPlan;
        const btnText = isCurrent ? `🔄 Продовжити ${title} (${price} ⭐️)` : `Купити ${title} (${price} ⭐️)`;

        keyboard.inline_keyboard.push([{ text: btnText, callback_data: `buy_plan_${plan.name}` }]);
    }

    keyboard.inline_keyboard.push([{ text: '⬅️ Назад', callback_data: backTarget }]);

    const options = {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard
    };

    try {
        // Спроба відредагувати існуюче повідомлення
        return await bot.editMessageText(message, options);
    } catch (err) {
        // Якщо це інвойс (який не можна редагувати), Telegram викине помилку
        if (err.message.includes('message can\'t be edited') || err.message.includes('message to edit not found')) {
            // Видаляємо старий інвойс
            await bot.deleteMessage(chatId, messageId).catch(() => { });
            // Надсилаємо магазин новим повідомленням
            return await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
        console.error("Помилка рендеру магазину:", err.message);
    }
};

const renderSourcesList = async (bot, chatId, messageId, chId) => {
    const ch = await Channel.findById(chId);
    if (!ch) return;

    let text = `📋 <b>Telegram-джерела для:</b> ${ch.channelUsername || 'каналу'}\n\n`;
    const keyboard = [];

    if (ch.tgSources && ch.tgSources.length > 0) {
        text += `📱 <b>Список підключених каналів:</b>\n`;
        ch.tgSources.forEach((src, index) => {
            text += `${index + 1}. <code>${src.url}</code>\n`;
            keyboard.push([{
                text: `🗑 Видалити джерело №${index + 1}`,
                callback_data: `remove_tgsrc_${chId}_${index}`
            }]);
        });
    } else {
        text += `<i>Джерел поки не додано. Бот не має звідки брати контент.</i>`;
    }

    keyboard.push([{ text: '➕ Додати TG Канал', callback_data: `add_tgsrc_${chId}` }]);
    keyboard.push([{ text: '⬅️ Назад до налаштувань', callback_data: `manage_${chId}` }]);

    const options = {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: keyboard }
    };

    try {
        if (messageId) {
            // Намагаємося відредагувати старе меню
            await bot.editMessageText(text, options);
        } else {
            // Якщо ID немає — шлемо нове повідомлення
            await bot.sendMessage(chatId, text, options);
        }
    } catch (err) {
        // Якщо редагування неможливе (наприклад, повідомлення застаріло), шлемо нове
        await bot.sendMessage(chatId, text, options);
    }
};

const renderProfile = async (bot, chatId, messageId, user) => {
    try {
        const planData = await Plan.findOne({ name: user.subscription.plan });

        if (planData && planData.hasCustomPrompt !== user.subscription.hasCustomPrompt) {
            user.subscription.hasCustomPrompt = planData.hasCustomPrompt;
            user.subscription.maxChannels = planData.maxChannels;
            user.subscription.maxPostsPerDay = planData.maxPostsPerDay;
            await user.save();
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
const renderChannelSettings = async (bot, chatId, messageId, channel, user) => {
    const tgCount = channel.tgSources?.length || 0;

    // 1. СТАТУС РОБОТИ (Активний/Пауза)
    const statusIcon = channel.isActive ? "🟢" : "🔴";
    const statusText = channel.isActive ? "ПРАЦЮЄ" : "ЗУПИНЕНО";
    const statusDesc = channel.isActive
        ? "Бот моніторить джерела та публікує новини."
        : "Бот ігнорує нові пости, поки ви його не запустите.";

    // 2. СТАТУС AI ПРОМПТУ (Ось те, що ми пропустили!)
    const isCustom = channel.aiPrompt !== null && channel.aiPrompt !== undefined;
    const aiStatus = isCustom ? '🟡 Кастомний' : '🟢 Стандартний';

    // 3. ОСТАННЯ ПЕРЕВІРКА
    const lastCheckDate = channel.lastCheckAt;
    const isNeverChecked = !lastCheckDate || lastCheckDate.getTime() === 0;
    const lastCheckStr = isNeverChecked ? "Ще не було" : lastCheckDate.toLocaleString('uk-UA');

    // 4. ЗАГОЛОВОК (Username каналу)
    const channelTitle = channel.channelUsername || "Без назви";

    const text = `⚙️ <b>Налаштування:</b> ${channelTitle}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🌐 <b>Канал:</b> <code>${channel.channelId || 'Не підключено'}</code>\n` +
        `📊 <b>Джерела:</b> TG: ${tgCount}\n` +
        `⏱ <b>Інтервал:</b> кожні ${channel.checkInterval} хв.\n` +
        `🤖 <b>AI Промпт:</b> ${aiStatus}\n` +
        `📢 <b>Статус проєкту:</b> ${statusIcon} <b>${statusText}</b>\n` +
        `<i>${statusDesc}</i>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🕒 <i>Остання перевірка: ${lastCheckStr}</i>`;

    const { getChannelSettingsKeyboard } = require('../keyboards/channel');

    return bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: getChannelSettingsKeyboard(channel, user)
        }
    }).catch(err => {
        if (!err.message.includes('message is not modified')) console.error(err);
    });
};
const renderAdminDashboard = async (bot, chatId, messageId) => {
    try {
        // Отримуємо статистику з сервісу
        const stats = await getAdminStats().catch(() => ({}));
        const now = new Date().toLocaleTimeString('uk-UA');

        const text = `<b>📊 ГОЛОВНИЙ ДАШБОРД</b>\n` +
            `<i>🕒 Оновлено о: ${now}</i>\n\n` +
            `👤 <b>Користувачі:</b> ${stats.general?.totalUsers || 0}\n` +
            `🆕 <b>Нових (24г):</b> ${stats.general?.newToday || 0}\n` +
            `📺 <b>Канали:</b> ${stats.channels?.total || 0}\n` +
            `📝 <b>Пости сьогодні:</b> ${stats.postsToday || 0}\n` +
            `💎 <b>Дохід:</b> ${stats.monthlyRevenue || 0} Stars`;

        return await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getAdminDashboardKeyboard() // Переконайся, що ця функція є в admin keyboards
        }).catch(err => {
            if (!err.message.includes('message is not modified')) {
                console.error("Render Dashboard Error:", err.message);
            }
        });
    } catch (err) {
        console.error("Critical Render Error:", err);
    }
};

module.exports = {
    renderAdminDashboard,
    renderChannelSettings,
    escapeHTML,
    renderPromptSettings,
    renderPlanEditCard,
    renderSubscriptionShop,
    renderSourcesList,
    renderProfile
};