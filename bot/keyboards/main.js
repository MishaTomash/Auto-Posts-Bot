const getMainMenu = (isAdmin = false) => {
    const buttons = [
        [{ text: '➕ Створити проект', callback_data: 'start_wizard' }],
        [{ text: '📊 Мої канали', callback_data: 'list_channels' }, { text: '👤 Профіль', callback_data: 'my_profile' }],
        [{ text: '💎 Купити підписку (Stars)', callback_data: 'subscription_shop' }]
    ];

    // Додаємо кнопку адміна в той самий блок, як на фото 2
    if (isAdmin) {
        buttons.push([{ text: '🛠 Адміністратор', callback_data: 'admin_dashboard' }]);
    }

    return { inline_keyboard: buttons };
};

const cancelMenu = (callbackData = 'main_menu') => ({
    inline_keyboard: [[{ text: '❌ Скасувати', callback_data: callbackData }]]
});

module.exports = { getMainMenu, cancelMenu };