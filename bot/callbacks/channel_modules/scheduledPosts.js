// bot/callbacks/channel_modules/scheduledPosts.js
// 4-кроковий wizard для запланованих постів:
//   Крок 1 — вміст (текст / фото / відео)
//   Крок 2 — час публікації
//   Крок 3 — пін-пріоритет (блокування авто-постів)
//   Крок 4 — авто-видалення

const ScheduledPost = require('../../../models/ScheduledPost');
const Channel       = require('../../../models/Channel');
const User          = require('../../../models/User');

// ─── Хелпери ─────────────────────────────────────────────────────────────────

const fmtDate = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleString('uk-UA', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
};

const fmtDur = (min) => {
    if (!min) return 'Немає';
    const h = Math.floor(min / 60), m = min % 60;
    if (h === 0) return `${m} хв`;
    return m > 0 ? `${h} год ${m} хв` : `${h} год`;
};

// ─── 1. Список запланованих постів ───────────────────────────────────────────
const handleSchedList = async (bot, query) => {
    const chatId    = query.message.chat.id;
    const messageId = query.message.message_id;
    const chId      = query.data.replace('sp_list_', '');

    const ch = await Channel.findById(chId);
    if (!ch) return bot.answerCallbackQuery(query.id, { text: '❌ Канал не знайдено' });

    const posts = await ScheduledPost.find({ channelId: chId, status: 'pending' })
        .sort({ scheduledAt: 1 });

    let text = `📅 <b>Заплановані пости</b>\n` +
               `Канал: <b>${ch.channelUsername}</b>\n` +
               `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const kb = { inline_keyboard: [] };

    if (posts.length === 0) {
        text += '<i>Немає запланованих постів</i>';
    } else {
        text += `Очікує публікації: <b>${posts.length}</b>\n`;
        for (const p of posts) {
            const icon = p.mediaType === 'photo' ? '📸' :
                         p.mediaType === 'video' ? '🎬' : '📝';
            const prev = p.text ? p.text.substring(0, 25) + (p.text.length > 25 ? '...' : '') : 'Без тексту';
            kb.inline_keyboard.push([{
                text:          `${icon} ${fmtDate(p.scheduledAt)} — ${prev}`,
                callback_data: `sp_view_${p._id}`
            }]);
        }
    }

    kb.inline_keyboard.push([{ text: '➕ Новий запланований пост', callback_data: `sp_new_${chId}` }]);
    kb.inline_keyboard.push([{ text: '⬅️ Назад до налаштувань',   callback_data: `manage_${chId}` }]);

    return bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: kb
    });
};

// ─── 2. Перегляд конкретного поста ────────────────────────────────────────────
const handleSchedView = async (bot, query) => {
    const chatId    = query.message.chat.id;
    const messageId = query.message.message_id;
    const postId    = query.data.replace('sp_view_', '');

    const post = await ScheduledPost.findById(postId);
    if (!post) return bot.answerCallbackQuery(query.id, { text: '❌ Пост не знайдено' });

    const icon    = post.mediaType === 'photo' ? '📸 Фото' :
                    post.mediaType === 'video' ? '🎬 Відео' : '📝 Текст';
    const pinTxt  = post.pinDurationMin  > 0 ? fmtDur(post.pinDurationMin)  : 'Без пріоритету';
    const delTxt  = post.deleteAfterMin  > 0 ? `Через ${fmtDur(post.deleteAfterMin)}` : 'Не видаляти';
    const textPrv = post.text ? `\n\n💬 <i>${post.text.substring(0, 200)}${post.text.length > 200 ? '...' : ''}</i>` : '';

    return bot.editMessageText(
        `📋 <b>Запланований пост</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📄 Тип: ${icon}\n` +
        `⏰ Публікація: <b>${fmtDate(post.scheduledAt)}</b>\n` +
        `📌 Пріоритет: <b>${pinTxt}</b>\n` +
        `🗑 Видалення: <b>${delTxt}</b>${textPrv}`,
        {
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🗑 Скасувати пост', callback_data: `sp_rmv_${postId}` }],
                    [{ text: '⬅️ Назад',           callback_data: `sp_list_${post.channelId}` }]
                ]
            }
        }
    );
};

// ─── 3. Скасувати (видалити) запланований пост ───────────────────────────────
const handleSchedRemove = async (bot, query) => {
    const chatId = query.message.chat.id;
    const postId = query.data.replace('sp_rmv_', '');

    const post = await ScheduledPost.findById(postId);
    if (!post) return bot.answerCallbackQuery(query.id, { text: '❌ Пост не знайдено' });

    const chId  = post.channelId.toString();
    post.status = 'cancelled';
    await post.save();

    await bot.answerCallbackQuery(query.id, { text: '✅ Пост скасовано' });
    query.data = `sp_list_${chId}`;
    return handleSchedList(bot, query);
};

// ─── 4. Почати новий пост (крок 1) ───────────────────────────────────────────
const handleSchedNew = async (bot, query) => {
    const chatId    = query.message.chat.id;
    const messageId = query.message.message_id;
    const chId      = query.data.replace('sp_new_', '');

    await User.findOneAndUpdate(
        { telegramId: chatId.toString() },
        {
            tempState: 'SCHED_STEP_1_CONTENT',
            $set: {
                tempData: {
                    targetChannelId:      chId,
                    instructionMessageId: messageId,
                    schedPost: { text: null, mediaFileId: null, mediaType: null,
                                 scheduledAt: null, pinDurationMin: 0, deleteAfterMin: 0 }
                }
            }
        }
    );

    return bot.editMessageText(
        `📝 <b>Крок 1/4 — Вміст поста</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Надішліть повідомлення для публікації:\n\n` +
        `• <b>Текст</b> — просто напишіть\n` +
        `• <b>Фото/відео</b> — надішліть файл (можна з підписом)`,
        {
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Скасувати', callback_data: `sp_list_${chId}` }]]
            }
        }
    );
};

// ─── Крок 2: UI вибору часу ───────────────────────────────────────────────────
const showTimeSelection = async (bot, chatId, messageId, chId) => {
    return bot.editMessageText(
        `⏰ <b>Крок 2/4 — Час публікації</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Оберіть, коли опублікувати пост:`,
        {
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '+1 год',  callback_data: `sp_t_60_${chId}`    },
                        { text: '+3 год',  callback_data: `sp_t_180_${chId}`   }
                    ],
                    [
                        { text: '+12 год', callback_data: `sp_t_720_${chId}`   },
                        { text: '+24 год', callback_data: `sp_t_1440_${chId}`  }
                    ],
                    [
                        { text: '+3 дні',  callback_data: `sp_t_4320_${chId}`  },
                        { text: '+7 днів', callback_data: `sp_t_10080_${chId}` }
                    ],
                    [{ text: '📅 Ввести дату і час вручну', callback_data: `sp_tm_${chId}` }],
                    [{ text: '⬅️ Назад до кроку 1',         callback_data: `sp_b1_${chId}` }],
                    [{ text: '❌ Скасувати',                  callback_data: `sp_list_${chId}` }]
                ]
            }
        }
    );
};

// ─── Крок 2: Обробка кнопки +N хвилин ────────────────────────────────────────
const handleSchedTimeSelect = async (bot, query, user) => {
    const chatId    = query.message.chat.id;
    const messageId = query.message.message_id;
    const parts     = query.data.split('_'); // ['sp','t','60','chId']
    const minutes   = parseInt(parts[2]);
    const chId      = parts[3];

    const scheduledAt = new Date(Date.now() + minutes * 60000);
    const td          = user.tempData || {};

    await User.findOneAndUpdate(
        { telegramId: chatId.toString() },
        {
            tempState: 'SCHED_STEP_3_PIN',
            $set: {
                tempData: {
                    ...td,
                    schedPost: { ...(td.schedPost || {}), scheduledAt }
                }
            }
        }
    );

    return showPinSelection(bot, chatId, messageId, chId);
};

// ─── Крок 2: Ручне введення часу ─────────────────────────────────────────────
const handleSchedTimeManual = async (bot, query) => {
    const chatId    = query.message.chat.id;
    const messageId = query.message.message_id;
    const chId      = query.data.replace('sp_tm_', '');

    await User.findOneAndUpdate(
        { telegramId: chatId.toString() },
        { tempState: 'SCHED_WAITING_TIME' }
    );

    return bot.editMessageText(
        `📅 <b>Введіть дату та час публікації</b>\n\n` +
        `Формат: <code>ДД.ММ ЧЧ:ХХ</code>\n\n` +
        `Приклади:\n` +
        `• <code>25.06 14:30</code>\n` +
        `• <code>01.07 09:00</code>`,
        {
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⬅️ Назад',     callback_data: `sp_b1_${chId}` }],
                    [{ text: '❌ Скасувати', callback_data: `sp_list_${chId}` }]
                ]
            }
        }
    );
};

// ─── Крок 3: UI пін-пріоритету ───────────────────────────────────────────────
const showPinSelection = async (bot, chatId, messageId, chId) => {
    return bot.editMessageText(
        `📌 <b>Крок 3/4 — Пріоритет поста</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Поки діє пріоритет — бот <b>не публікує</b> авто-пости.\n\n` +
        `Оберіть тривалість:`,
        {
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚫 Без пріоритету', callback_data: `sp_p_0_${chId}`    }],
                    [
                        { text: '1 год',  callback_data: `sp_p_60_${chId}`   },
                        { text: '3 год',  callback_data: `sp_p_180_${chId}`  }
                    ],
                    [
                        { text: '6 год',  callback_data: `sp_p_360_${chId}`  },
                        { text: '12 год', callback_data: `sp_p_720_${chId}`  }
                    ],
                    [{ text: '24 год', callback_data: `sp_p_1440_${chId}` }],
                    [{ text: '⬅️ Назад до кроку 2', callback_data: `sp_b2_${chId}` }],
                    [{ text: '❌ Скасувати',          callback_data: `sp_list_${chId}` }]
                ]
            }
        }
    );
};

// ─── Крок 3: Обробка вибору пін-пріоритету ────────────────────────────────────
const handleSchedPinSelect = async (bot, query, user) => {
    const chatId    = query.message.chat.id;
    const messageId = query.message.message_id;
    const parts     = query.data.split('_'); // ['sp','p','60','chId']
    const pinMin    = parseInt(parts[2]);
    const chId      = parts[3];
    const td        = user.tempData || {};

    await User.findOneAndUpdate(
        { telegramId: chatId.toString() },
        {
            tempState: 'SCHED_STEP_4_DELETE',
            $set: {
                tempData: {
                    ...td,
                    schedPost: { ...(td.schedPost || {}), pinDurationMin: pinMin }
                }
            }
        }
    );

    return showDeleteSelection(bot, chatId, messageId, chId);
};

// ─── Крок 4: UI авто-видалення ────────────────────────────────────────────────
const showDeleteSelection = async (bot, chatId, messageId, chId) => {
    return bot.editMessageText(
        `🗑 <b>Крок 4/4 — Авто-видалення</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Через який час видалити пост з каналу?`,
        {
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚫 Не видаляти', callback_data: `sp_d_0_${chId}`    }],
                    [
                        { text: '1 год',  callback_data: `sp_d_60_${chId}`   },
                        { text: '3 год',  callback_data: `sp_d_180_${chId}`  }
                    ],
                    [
                        { text: '6 год',  callback_data: `sp_d_360_${chId}`  },
                        { text: '12 год', callback_data: `sp_d_720_${chId}`  }
                    ],
                    [
                        { text: '24 год', callback_data: `sp_d_1440_${chId}` },
                        { text: '3 дні',  callback_data: `sp_d_4320_${chId}` }
                    ],
                    [{ text: '⬅️ Назад до кроку 3', callback_data: `sp_b3_${chId}` }],
                    [{ text: '❌ Скасувати',          callback_data: `sp_list_${chId}` }]
                ]
            }
        }
    );
};

// ─── Крок 4: Обробка вибору авто-видалення ────────────────────────────────────
const handleSchedDeleteSelect = async (bot, query, user) => {
    const chatId    = query.message.chat.id;
    const messageId = query.message.message_id;
    const parts     = query.data.split('_'); // ['sp','d','0','chId']
    const delMin    = parseInt(parts[2]);
    const chId      = parts[3];
    const td        = user.tempData || {};

    const newTd = {
        ...td,
        schedPost: { ...(td.schedPost || {}), deleteAfterMin: delMin }
    };

    await User.findOneAndUpdate(
        { telegramId: chatId.toString() },
        { $set: { tempData: newTd } }
    );

    return showConfirmation(bot, chatId, messageId, chId, newTd.schedPost);
};

// ─── Підтвердження ────────────────────────────────────────────────────────────
const showConfirmation = async (bot, chatId, messageId, chId, sp) => {
    const icon    = sp.mediaType === 'photo' ? '📸 Фото' :
                    sp.mediaType === 'video' ? '🎬 Відео' : '📝 Текст';
    const timeStr = sp.scheduledAt ? fmtDate(new Date(sp.scheduledAt)) : '—';
    const pinStr  = sp.pinDurationMin  > 0 ? fmtDur(sp.pinDurationMin)  : 'Без пріоритету';
    const delStr  = sp.deleteAfterMin  > 0 ? `Через ${fmtDur(sp.deleteAfterMin)}` : 'Не видаляти';
    const prev    = sp.text
        ? `\n💬 <i>${sp.text.substring(0, 100)}${sp.text.length > 100 ? '...' : ''}</i>`
        : '';

    return bot.editMessageText(
        `✅ <b>Підтвердження публікації</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📄 Вміст: ${icon}${prev}\n` +
        `⏰ Публікація: <b>${timeStr}</b>\n` +
        `📌 Пріоритет: <b>${pinStr}</b>\n` +
        `🗑 Видалення: <b>${delStr}</b>`,
        {
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Підтвердити', callback_data: `sp_ok_${chId}`   },
                        { text: '❌ Скасувати',   callback_data: `sp_list_${chId}` }
                    ],
                    [{ text: '⬅️ Назад до кроку 4', callback_data: `sp_b4_${chId}` }]
                ]
            }
        }
    );
};

// ─── Зберегти пост ───────────────────────────────────────────────────────────
const handleSchedConfirm = async (bot, query, user) => {
    const chatId = query.message.chat.id;
    const chId   = query.data.replace('sp_ok_', '');
    const td     = user.tempData || {};
    const sp     = td.schedPost;

    if (!sp || !sp.scheduledAt) {
        return bot.answerCallbackQuery(query.id, {
            text: '⚠️ Помилка: дані поста втрачено', show_alert: true
        });
    }

    const ch = await Channel.findById(chId);
    if (!ch) return bot.answerCallbackQuery(query.id, { text: '❌ Канал не знайдено' });

    await ScheduledPost.create({
        channelId:         chId,
        telegramChannelId: ch.channelId,
        userId:            user._id,
        text:              sp.text       || null,
        mediaFileId:       sp.mediaFileId || null,
        mediaType:         sp.mediaType   || null,
        scheduledAt:       new Date(sp.scheduledAt),
        pinDurationMin:    sp.pinDurationMin  || 0,
        deleteAfterMin:    sp.deleteAfterMin  || 0,
        status:            'pending'
    });

    await User.findOneAndUpdate(
        { telegramId: chatId.toString() },
        { tempState: null, $set: { tempData: {} } }
    );

    await bot.answerCallbackQuery(query.id, { text: '✅ Пост заплановано!' });
    query.data = `sp_list_${chId}`;
    return handleSchedList(bot, query);
};

// ─── Навігація назад між кроками ─────────────────────────────────────────────
const handleSchedBack = async (bot, query, user) => {
    const chatId    = query.message.chat.id;
    const messageId = query.message.message_id;
    const parts     = query.data.split('_'); // ['sp','b1','chId'] або ['sp','b2','chId']
    const step      = parts[1]; // 'b1','b2','b3','b4'
    const chId      = parts[2];
    const td        = user.tempData || {};

    if (step === 'b1') {
        // Повернутись до кроку 1: скидаємо контент та стан
        await User.findOneAndUpdate(
            { telegramId: chatId.toString() },
            {
                tempState: 'SCHED_STEP_1_CONTENT',
                $set: {
                    tempData: {
                        ...td,
                        schedPost: {
                            ...(td.schedPost || {}),
                            text: null, mediaFileId: null, mediaType: null
                        }
                    }
                }
            }
        );
        return bot.editMessageText(
            `📝 <b>Крок 1/4 — Вміст поста</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Надішліть повідомлення для публікації:\n\n` +
            `• <b>Текст</b> — просто напишіть\n` +
            `• <b>Фото/відео</b> — надішліть файл (можна з підписом)`,
            {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Скасувати', callback_data: `sp_list_${chId}` }]]
                }
            }
        );
    }

    if (step === 'b2') {
        await User.findOneAndUpdate(
            { telegramId: chatId.toString() },
            { tempState: 'SCHED_STEP_2_TIME' }
        );
        return showTimeSelection(bot, chatId, messageId, chId);
    }

    if (step === 'b3') {
        await User.findOneAndUpdate(
            { telegramId: chatId.toString() },
            { tempState: 'SCHED_STEP_3_PIN' }
        );
        return showPinSelection(bot, chatId, messageId, chId);
    }

    if (step === 'b4') {
        await User.findOneAndUpdate(
            { telegramId: chatId.toString() },
            { tempState: 'SCHED_STEP_4_DELETE' }
        );
        return showDeleteSelection(bot, chatId, messageId, chId);
    }
};

// ─── Головний роутер ─────────────────────────────────────────────────────────
const handleScheduledPosts = async (bot, query, user) => {
    const { data } = query;

    if (data.startsWith('sp_list_'))  return handleSchedList(bot, query);
    if (data.startsWith('sp_new_'))   return handleSchedNew(bot, query);
    if (data.startsWith('sp_view_'))  return handleSchedView(bot, query);
    if (data.startsWith('sp_rmv_'))   return handleSchedRemove(bot, query);
    if (data.startsWith('sp_tm_'))    return handleSchedTimeManual(bot, query);          // перед sp_t_
    if (data.startsWith('sp_t_'))     return handleSchedTimeSelect(bot, query, user);
    if (data.startsWith('sp_p_'))     return handleSchedPinSelect(bot, query, user);
    if (data.startsWith('sp_d_'))     return handleSchedDeleteSelect(bot, query, user);  // перед sp_del_
    if (data.startsWith('sp_ok_'))    return handleSchedConfirm(bot, query, user);
    if (data.startsWith('sp_b'))      return handleSchedBack(bot, query, user);
};

module.exports = {
    handleScheduledPosts,
    showTimeSelection,
    showPinSelection,
    showDeleteSelection
};