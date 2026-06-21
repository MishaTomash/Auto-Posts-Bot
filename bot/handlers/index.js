// bot/handlers/index.js
//
// Обробник вхідних текстових повідомлень бота. Реагує на successful_payment
// та на текстові стани (tempState), залежно від того, на якому кроці
// перебуває користувач (майстер створення проєкту, редагування промпту,
// розсилка, пошук у адмінці тощо).
//
// РЕФАКТОРИНГ оригінального файлу (459 рядків):
//
// 1) Видалено затінення змінних (variable shadowing): `chatId`, `user`, `text`
//    оголошувались через `const` на верхньому рівні функції і ПОВТОРНО через
//    `const` всередині `try {}` — це працювало лише тому, що JS дозволяє
//    тіньове оголошення у вкладеному блоці, але це заплутаний і небезпечний
//    патерн. Тепер змінні оголошуються один раз.
//
// 2) Видалено явно мертвий код (стани, які НІДЕ в проєкті не встановлюються
//    через tempState, тож ці гілки ніколи не виконувались):
//      - 'WAITING_FOR_JSON_RETRY'
//      - 'WAITING_FOR_TG_SOURCE' (стара версія WAITING_TG_SOURCE)
//      - 'WAITING_BC_TEXT' / 'WAITING_BC_BUTTON' / 'WAITING_BC_CONFIRM'
//        (стара версія флоу розсилки, замінена на ADMIN_AWAITING_BROADCAST
//        -> CONFIRM_BROADCAST)
//      - user.state === 'WAITING_FOR_CHANNEL_ID' — використовував неіснуючі
//        поля моделі (user.state, user.tempChannelName, newChannel.name,
//        isPaused, userId: chatId замість user._id) — це нічого не могло
//        зберегти навіть якби виконалось.
//    Деталі та причини видалення задокументовані у відповідних text_states/*.
//
// 3) Логіка розкладена за доменом у bot/handlers/text_states/*.

const User = require('../../models/User');

const { handleStep1Name, handleStep2Id } = require('./text_states/wizardSteps');
const { handleEditPrompt } = require('./text_states/promptEdit');
const { handleAwaitingBroadcast } = require('./text_states/broadcastFlow');
const { handleWaitingTgSource, handleManualInterval } = require('./text_states/sourceAndInterval');
const { handleAdminUserSearch, handleAdminPlanEdit } = require('./text_states/adminTextStates');

module.exports = async (bot, msg, callbacks) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    if (msg.successful_payment) {
        console.log('💰 Оплата отримана!');

        // Видаляємо службове повідомлення про оплату
        await bot.deleteMessage(chatId, msg.message_id).catch(() => {});

        // Спробуємо видалити повідомлення з інвойсом (яке було перед цим)
        await bot.deleteMessage(chatId, msg.message_id - 1).catch(() => {});

        // TODO: тут виклик функції активації тарифу (відсутній в оригіналі)
        return;
    }

    // Отримуємо юзера та перевіряємо, чи є активний стан
    const user = await User.findOne({ telegramId: chatId.toString() });
    if (!user || !user.tempState) return;

    // --- ЛОГІКА РОЗСИЛКИ (окрема гілка, як і в оригіналі — поза основним try) ---
    if (user.tempState === 'ADMIN_AWAITING_BROADCAST') {
        return handleAwaitingBroadcast(bot, chatId, text, msg);
    }

    if (!text) return;

    try {
        const state = user.tempState;
        const editingId = user.tempData?.editingChannelId;
        const menuId = user.lastMenuMessageId;

        // Видаляємо повідомлення користувача для чистоти чату
        await bot.deleteMessage(chatId, msg.message_id).catch(() => {});

        if (state === 'STEP_1_NAME') {
            return handleStep1Name(bot, chatId, text, menuId);
        }

        if (state === 'STEP_2_ID') {
            return handleStep2Id(bot, chatId, text, menuId);
        }

        if (state === 'EDIT_PROMPT') {
            return handleEditPrompt(bot, chatId, msg, text, user);
        }

        if (user.tempState === 'WAITING_TG_SOURCE') {
            return handleWaitingTgSource(bot, chatId, msg, user);
        }

        if (user.tempState === 'WAITING_MANUAL_INTERVAL') {
            return handleManualInterval(bot, chatId, msg, text, user);
        }

        if (state === 'WAITING_FOR_ADMIN_USER_SEARCH') {
            return handleAdminUserSearch(bot, chatId, msg, text);
        }

        if (state && state.startsWith('ADMIN_PLAN_EDIT_')) {
            return handleAdminPlanEdit(bot, chatId, text, user, state);
        }

    } catch (e) {
        console.error('Handler Error:', e.message);
    }
};