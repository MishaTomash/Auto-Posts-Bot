const getChannelSettingsKeyboard = (ch, user) => {
    const toggleText = ch.isEnabled ? "🛑 Зупинити проєкт" : "🚀 Запустити проєкт";
    const plan = user?.subscription?.plan || 'free';

    const canUseAI = user?.role === 'admin' ||
        user?.subscription?.hasCustomPrompt === true ||
        (plan !== 'free' && plan !== 'FREE');

    console.log(`DEBUG: Plan=${plan}, hasAI=${user?.subscription?.hasCustomPrompt}, FinalCanUse=${canUseAI}`);

    const keyboard = [
        [{ text: '🔄 Перевірити зараз', callback_data: `check_one_${ch._id}` }],
        [{ text: '📋 Джерела (RSS/JSON)', callback_data: `sources_list_${ch._id}` }],
        [{ text: '⏱ Інтервал', callback_data: `edit_interval_${ch._id}` }],
        [{
            text: canUseAI ? '🤖 AI Промпт' : '🔒 AI Промпт (Pro/Biz)',
            callback_data: canUseAI ? `edit_prompt_${ch._id}` : `locked_feature_ai`
        }],
        [{ text: toggleText, callback_data: `admin_ch_toggle_${ch._id}` }],
        [{ text: '🗑 Видалити канал', callback_data: `del_${ch._id}` }],
        [{ text: '⬅️ Мої канали', callback_data: 'list_channels' }, { text: '🏠 Меню', callback_data: 'main_menu' }]
    ];

    return keyboard;
};
const getIntervalKeyboard = (ch) => {
    // Змінюємо аргумент з chId на ch (об'єкт), 
    // або переконуємось, що передаємо саме ID.
    // Найбезпечніше звертатися ch._id або ch (якщо це вже ID)


    const id = ch._id || ch;

    return [
        [{ text: '15 хв', callback_data: `set_int_${id}_15` }, { text: '30 хв', callback_data: `set_int_${id}_30` }],
        [{ text: '1 год', callback_data: `set_int_${id}_60` }, { text: '3 год', callback_data: `set_int_${id}_180` }],
        [{ text: '6 год', callback_data: `set_int_${id}_360` }, { text: '12 год', callback_data: `set_int_${id}_720` }],
        [{ text: '⬅️ Назад', callback_data: `manage_${id}` }]
    ];
};

module.exports = { getChannelSettingsKeyboard, getIntervalKeyboard };