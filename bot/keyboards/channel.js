// keyboards/channel.js

const getChannelSettingsKeyboard = (ch, user) => {
    // 1. Визначаємо текст для перемикача (Toggle)
    // Використовуємо isActive або isEnabled залежно від того, що у тебе в логіці головне
    const toggleText = ch.isActive ? "⏸ Призупинити роботу" : "🚀 Запустити проєкт";
    const toggleAction = `user_ch_toggle_${ch._id}`;

    const plan = user?.subscription?.plan || 'free';
    const canUseAI = user?.role === 'admin' ||
        user?.subscription?.hasCustomPrompt === true ||
        (plan !== 'free' && plan !== 'FREE');

    const keyboard = [
        [{ text: '🔄 Перевірити джерела зараз', callback_data: `check_one_${ch._id}` }],
        [{ text: toggleText, callback_data: toggleAction }],

        [
            { text: '📂 Джерела', callback_data: `sources_list_${ch._id}` },
            { text: '⏱ Інтервал', callback_data: `edit_interval_${ch._id}` }
        ],
        [{
            text: canUseAI ? '🤖 AI Налаштування' : '🔒 AI Налаштування (Premium)',
            callback_data: canUseAI ? `edit_prompt_${ch._id}` : `locked_feature_ai`
        }],

        [{ text: '🔗 Перейти в канал', url: `https://t.me/${ch.channelId?.replace('@', '')}` }],

        [{ text: '🗑 Видалити цей проєкт', callback_data: `del_${ch._id}` }],

        [
            { text: '⬅️ Мої проєкти', callback_data: 'list_channels' },
            { text: '🏠 Меню', callback_data: 'main_menu' }
        ]
    ];

    return keyboard;
};

const getIntervalKeyboard = (ch) => {
    const id = ch._id || ch;

    return [
        [{ text: '15 хв', callback_data: `set_int_${id}_15` }, { text: '30 хв', callback_data: `set_int_${id}_30` }],
        [{ text: '1 год', callback_data: `set_int_${id}_60` }, { text: '3 год', callback_data: `set_int_${id}_180` }],
        [{ text: '6 год', callback_data: `set_int_${id}_360` }, { text: '12 год', callback_data: `set_int_${id}_720` }],
        [{ text: '⬅️ Назад до налаштувань', callback_data: `manage_${id}` }]
    ];
};

module.exports = { getChannelSettingsKeyboard, getIntervalKeyboard };