// bot/keyboards/channel.js

const getChannelSettingsKeyboard = (ch, user) => {
    const toggleText = ch.isActive ? '⏸ Призупинити роботу' : '🚀 Запустити проєкт';
    const plan = user?.subscription?.plan || 'free';
    const canUseAI = user?.role === 'admin' ||
        user?.subscription?.hasCustomPrompt === true ||
        (plan !== 'free' && plan !== 'FREE');

    return [
        [{ text: '🔄 Перевірити джерела зараз', callback_data: `check_one_${ch._id}` }],
        [{ text: toggleText, callback_data: `user_ch_toggle_${ch._id}` }],
        [
            { text: '📂 Джерела', callback_data: `sources_list_${ch._id}` },
            { text: '⏱ Розклад та ліміт постів', callback_data: `edit_interval_${ch._id}` }
        ],
        [{
            text: canUseAI ? '🤖 AI Налаштування' : '🔒 AI Налаштування',
            callback_data: canUseAI ? `edit_prompt_${ch._id}` : 'locked_feature_ai'
        }],
        [{ text: '📅 Заплановані пости', callback_data: `sp_list_${ch._id}` }],
        [{ text: '🔗 Перейти в канал', url: `https://t.me/${ch.channelId?.replace('@', '')}` }],
        [{ text: '🗑 Видалити цей проєкт', callback_data: `del_${ch._id}` }],
        [
            { text: '⬅️ Мої проєкти', callback_data: 'list_channels' },
            { text: '🏠 Меню', callback_data: 'main_menu' }
        ]
    ];
};

const getIntervalKeyboard = (ch) => {
    const id = ch._id ? ch._id.toString() : ch.toString();
    const limit = ch.dailyPostLimit || 10;
    const used = ch.todayPostCount || 0;
    const remaining = Math.max(0, limit - used);

    // Прогрес-бар
    const totalBlocks = 10;
    const filledBlocks = Math.round((used / limit) * totalBlocks);
    const bar = '█'.repeat(filledBlocks) + '░'.repeat(totalBlocks - filledBlocks);

    return [
        [{ text: `📊 Опубліковано сьогодні: ${used}/${limit}`, callback_data: 'noop' }],
        [{ text: `${bar}  залишилось: ${remaining}`,           callback_data: 'noop' }],
        [{ text: '➕ 5',  callback_data: `set_limit_${id}_5`   },
         { text: '10',    callback_data: `set_limit_${id}_10`  },
         { text: '20',    callback_data: `set_limit_${id}_20`  },
         { text: '50',    callback_data: `set_limit_${id}_50`  }],
        [{ text: '100',   callback_data: `set_limit_${id}_100` },
         { text: '150',   callback_data: `set_limit_${id}_150` },
         { text: '200 (макс)', callback_data: `set_limit_${id}_200` }],
        [{ text: '✏️ Ввести своє число (1–200)', callback_data: `manual_limit_${id}` }],
        [{ text: '━━━ Як часто перевіряти? ━━━', callback_data: 'noop' }],
        [{ text: 'Кожні 15 хв', callback_data: `set_int_${id}_15`  },
         { text: 'Кожні 30 хв', callback_data: `set_int_${id}_30`  }],
        [{ text: 'Кожну годину', callback_data: `set_int_${id}_60`  },
         { text: 'Кожні 3 год',  callback_data: `set_int_${id}_180` }],
        [{ text: '📅 Вибрати конкретні години доби',    callback_data: `open_schedule_${id}` }],
        [{ text: '✏️ Ввести свій інтервал (у хвилинах)', callback_data: `manual_int_${id}`    }],
        [{ text: '⬅️ Назад до налаштувань каналу',       callback_data: `manage_${id}`        }]
    ];
};

const getScheduleKeyboard = (ch) => {
    const id = ch._id ? ch._id.toString() : ch.toString();
    const schedule = ch.dailySchedule || [];
    const keyboard = [];

    for (let i = 0; i < 24; i += 4) {
        const row = [];
        for (let j = 0; j < 4; j++) {
            const hour = i + j;
            const isSelected = schedule.includes(hour);
            row.push({
                text: isSelected ? `✅ ${hour}:00` : `${hour}:00`,
                callback_data: `toggle_hour_${id}_${hour}`
            });
        }
        keyboard.push(row);
    }

    keyboard.push([{ text: '🔄 Перейти на інтервали', callback_data: `set_mode_interval_${id}` }]);
    keyboard.push([{ text: '⬅️ Назад', callback_data: `edit_interval_${id}` }]);

    return { inline_keyboard: keyboard };
};

module.exports = { getChannelSettingsKeyboard, getIntervalKeyboard, getScheduleKeyboard };