// bot/keyboards/admin.js

const adminMenu = {
    inline_keyboard: [
        [{ text: '📊 Дашборд', callback_data: 'admin_dashboard' }],
        [{ text: '👥 Користувачі', callback_data: 'admin_users' }, { text: '📺 Канали', callback_data: 'admin_channels' }],
        [{ text: '💎 Тарифи', callback_data: 'admin_plans' }, { text: '📢 Розсилка', callback_data: 'admin_broadcast' }],
        [{ text: '🏠 Вийти в головне меню', callback_data: 'main_menu_exit' }]
    ]
};

const getAdminDashboardKeyboard = () => ({
    inline_keyboard: [
        [{ text: '👥 Користувачі', callback_data: 'admin_users' }, { text: '🔄 Оновити', callback_data: 'admin_dashboard' }],
        [{ text: '📢 Розсилка', callback_data: 'admin_broadcast' }, { text: '📺 Канали', callback_data: 'admin_channels' }],
        [{ text: '💳 Тарифи', callback_data: 'admin_plans' }, { text: '🏠 Вихід', callback_data: 'main_menu_exit' }]
    ]
});

const getUsersKeyboard = (users, currentPage, totalPages) => {
    const keyboard = [];

    for (let i = 0; i < users.length; i += 2) {
        const row = [];
        const u1  = users[i];
        const st1 = u1.isBlocked ? '🚫' : (u1.role === 'admin' ? '⭐' : '👤');
        row.push({
            text:          `${st1} ${u1.username || u1.telegramId.toString().slice(0, 7)} (${u1.subscription?.plan || 'free'})`,
            callback_data: `admin_user_view_${u1._id}`
        });

        if (users[i + 1]) {
            const u2  = users[i + 1];
            const st2 = u2.isBlocked ? '🚫' : (u2.role === 'admin' ? '⭐' : '👤');
            row.push({
                text:          `${st2} ${u2.username || u2.telegramId.toString().slice(0, 7)} (${u2.subscription?.plan || 'free'})`,
                callback_data: `admin_user_view_${u2._id}`
            });
        }
        keyboard.push(row);
    }

    const paginationRow = [];
    if (currentPage > 1) {
        paginationRow.push({ text: '⬅️', callback_data: `admin_users_page_${currentPage - 1}` });
    }
    paginationRow.push({ text: `• ${currentPage} / ${totalPages} •`, callback_data: `admin_users_page_${currentPage}` });
    if (currentPage < totalPages) {
        paginationRow.push({ text: '➡️', callback_data: `admin_users_page_${currentPage + 1}` });
    }
    keyboard.push(paginationRow);

    keyboard.push([
        { text: '🔍 Пошук',   callback_data: 'admin_user_search' },
        { text: '🔄 Оновити', callback_data: `admin_users_page_${currentPage}` }
    ]);
    keyboard.push([{ text: '⬅️ До дашборду', callback_data: 'admin_dashboard' }]);

    return { inline_keyboard: keyboard };
};

const getChannelsKeyboard = (channels, currentPage, totalPages) => {
    const keyboard = channels.map(ch => ([{
        text:          `${ch.isActive ? '✅' : '❌'} ${ch.channelUsername || 'Без назви'} (@${ch.userId?.username || 'ID:' + ch.userId?.telegramId})`,
        callback_data: `admin_ch_view_${ch._id}`
    }]));

    const paginationRow = [];
    if (currentPage > 1)       paginationRow.push({ text: '⬅️', callback_data: `admin_ch_page_${currentPage - 1}` });
    if (currentPage < totalPages) paginationRow.push({ text: '➡️', callback_data: `admin_ch_page_${currentPage + 1}` });
    if (paginationRow.length > 0) keyboard.push(paginationRow);

    keyboard.push([{ text: '🔍 Пошук каналу', callback_data: 'admin_ch_search' }]);
    keyboard.push([{ text: '⬅️ До дашборду',  callback_data: 'admin_dashboard' }]);

    return { inline_keyboard: keyboard };
};

// ─── Список тарифів — ціна в грн ─────────────────────────────────────────────
const getAdminPlansKeyboard = (plans) => {
    const keyboard = plans.map(plan => ([{
        text:          `💎 ${plan.name.toUpperCase()} — ${plan.price} грн`,
        callback_data: `admin_plan_view_${plan._id}`
    }]));

    keyboard.push([{ text: '➕ Додати новий тариф', callback_data: 'admin_plan_create' }]);
    keyboard.push([{ text: '⬅️ До дашборду',        callback_data: 'admin_dashboard'  }]);

    return { inline_keyboard: keyboard };
};

// ─── Редагування конкретного тарифу ──────────────────────────────────────────
const getPlanEditKeyboard = (planId, isAiEnabled) => ({
    inline_keyboard: [
        [{ text: '💰 Змінити ціну',    callback_data: `admin_plan_edit_price_${planId}`    }],
        [{ text: '📺 Ліміт каналів',   callback_data: `admin_plan_edit_channels_${planId}` }],
        [{ text: '📝 Ліміт постів',    callback_data: `admin_plan_edit_posts_${planId}`    }],
        [{ text: `🤖 AI Промпт (${isAiEnabled ? '✅ ТАК' : '❌ НІ'})`, callback_data: `admin_plan_edit_ai_${planId}` }],
        [{ text: '🗑 Видалити тариф',  callback_data: `admin_plan_delete_${planId}`        }],
        [{ text: '⬅️ До списку тарифів', callback_data: 'admin_plans'                     }]
    ]
});

const getConfirmKeyboard = (action, targetId) => ({
    inline_keyboard: [[
        { text: '✅ ТАК, впевнений', callback_data: `admin_confirm_${action}_${targetId}` },
        { text: '❌ НІ, скасувати',  callback_data: 'admin_users' }
    ]]
});

const getUserManageKeyboard = (userId) => ({
    inline_keyboard: [
        [{ text: '💎 Змінити тариф', callback_data: `admin_user_plan_${userId}`          }],
        [{ text: '🗑 Видалити',       callback_data: `admin_user_delete_request_${userId}` }],
        [{ text: '🔙 Назад до списку', callback_data: 'admin_users'                       }]
    ]
});

function getChannelAdminControlKeyboard(chId) {
    return {
        inline_keyboard: [
            [{ text: '⚙️ Налаштування джерел', callback_data: `admin_ch_sources_${chId}` }],
            [{ text: '🗑 Видалити канал',        callback_data: `admin_ch_delete_${chId}` }],
            [{ text: '⬅️ Назад до списку ',       callback_data: 'admin_channels_list'     }]
        ]
    };
}

function getChannelSourcesKeyboard(chId, tgSources = []) {
    const buttons = [];

    if (Array.isArray(tgSources) && tgSources.length > 0) {
        tgSources.forEach((src, index) => {
            let displayName = src.url.replace('https://t.me/', '').replace('@', '');
            if (displayName.length > 15) displayName = displayName.substring(0, 15) + '...';

            buttons.push([{
                text:          `📢 TG: @${displayName}`,
                callback_data: `admin_src_view_tg_${chId}_${index}`
            }]);
        });
    }

    buttons.push([{ text: '⬅️ Назад до каналу', callback_data: `admin_ch_view_${chId}` }]);
    return { inline_keyboard: buttons };
}

function getSourceConfirmKeyboard(chId, type, index) {
    return {
        inline_keyboard: [
            [{ text: '🗑 Підтвердити видалення', callback_data: `admin_src_del_${type}_${chId}_${index}` }],
            [{ text: '⬅️ Назад до списку',        callback_data: `admin_ch_sources_${chId}`              }]
        ]
    };
}

module.exports = {
    getSourceConfirmKeyboard,
    getChannelSourcesKeyboard,
    getChannelAdminControlKeyboard,
    getUserManageKeyboard,
    getAdminDashboardKeyboard,
    adminMenu,
    getUsersKeyboard,
    getChannelsKeyboard,
    getAdminPlansKeyboard,
    getPlanEditKeyboard,
    getConfirmKeyboard
};