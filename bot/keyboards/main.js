// bot/keyboards/main.js

const getMainMenu = (isAdmin = false) => {
    const buttons = [
        [{ text: '➕ Створити проект',   callback_data: 'start_wizard'       }],
        [
            { text: '📊 Мої канали', callback_data: 'list_channels' },
            { text: '👤 Профіль',    callback_data: 'my_profile'    }
        ],
        [{ text: '💎 Купити підписку',   callback_data: 'subscription_shop'  }],
        [{ text: '📖 Інструкція',        callback_data: 'instr_main'         }],
    ];

    if (isAdmin) {
        buttons.push([{ text: '🛠 Адміністратор', callback_data: 'admin_dashboard' }]);
    }

    return { inline_keyboard: buttons };
};

const cancelMenu = (callbackData = 'main_menu') => ({
    inline_keyboard: [[{ text: '❌ Скасувати', callback_data: callbackData }]]
});

module.exports = { getMainMenu, cancelMenu };