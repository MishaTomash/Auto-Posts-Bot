// bot/keyboards/channel.js

const getChannelSettingsKeyboard = (ch, user) => {
    const toggleText = ch.isActive ? '⏸ Призупинити роботу' : '🚀 Запустити проєкт';
    const plan      = user?.subscription?.plan || 'free';
    const canUseAI  = user?.role === 'admin' ||
                      user?.subscription?.hasCustomPrompt === true ||
                      (plan !== 'free' && plan !== 'FREE');

    return [
        [{ text: '🔄 Перевірити джерела зараз', callback_data: `check_one_${ch._id}` }],
        [{ text: toggleText, callback_data: `user_ch_toggle_${ch._id}` }],
        [
            { text: '📂 Джерела',        callback_data: `sources_list_${ch._id}`  },
            { text: '⏱ Налаштувати час', callback_data: `edit_interval_${ch._id}` }
        ],
        [{
            text:          canUseAI ? '🤖 AI Налаштування' : '🔒 AI Налаштування',
            callback_data: canUseAI ? `edit_prompt_${ch._id}` : 'locked_feature_ai'
        }],
        [{ text: '📅 Заплановані пости', callback_data: `sp_list_${ch._id}` }],
        [{ text: '🔗 Перейти в канал', url: `https://t.me/${ch.channelId?.replace('@', '')}` }],
        [{ text: '🗑 Видалити цей проєкт', callback_data: `del_${ch._id}` }],
        [
            { text: '⬅️ Мої проєкти', callback_data: 'list_channels' },
            { text: '🏠 Меню',         callback_data: 'main_menu'     }
        ]
    ];
};

const getIntervalKeyboard = (ch) => {
    const id = ch._id ? ch._id.toString() : ch.toString();
    return [
        [{ text: '15 хв', callback_data: `set_int_${id}_15`  }, { text: '30 хв', callback_data: `set_int_${id}_30`  }],
        [{ text: '1 год', callback_data: `set_int_${id}_60`  }, { text: '3 год', callback_data: `set_int_${id}_180` }],
        [{ text: '📅 Конкретні години (Розклад)', callback_data: `open_schedule_${id}` }],
        [{ text: '⌨️ Ввести вручну (хв)',         callback_data: `manual_int_${id}`    }],
        [{ text: '⬅️ Назад до налаштувань',        callback_data: `manage_${id}`        }]
    ];
};

const getScheduleKeyboard = (ch) => {
    const id       = ch._id ? ch._id.toString() : ch.toString();
    const schedule = ch.dailySchedule || [];
    const keyboard = [];

    for (let i = 0; i < 24; i += 4) {
        const row = [];
        for (let j = 0; j < 4; j++) {
            const hour       = i + j;
            const isSelected = schedule.includes(hour);
            row.push({
                text:          isSelected ? `✅ ${hour}:00` : `${hour}:00`,
                callback_data: `toggle_hour_${id}_${hour}`
            });
        }
        keyboard.push(row);
    }

    keyboard.push([{ text: '🔄 Перейти на інтервали', callback_data: `set_mode_interval_${id}` }]);
    keyboard.push([{ text: '⬅️ Назад',                callback_data: `edit_interval_${id}`      }]);

    return { inline_keyboard: keyboard };
};

module.exports = { getChannelSettingsKeyboard, getIntervalKeyboard, getScheduleKeyboard };