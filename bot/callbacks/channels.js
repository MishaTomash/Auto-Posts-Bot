// bot/callbacks/channels.js

const { handleListChannels, handleManageChannel } = require('./channel_modules/channelList');
const { handleAddSourceStart, handleSourcesList, handleRemoveSource } = require('./channel_modules/sources');
const {
    handleEditIntervalMenu,
    handleSetInterval,
    handleManualIntervalStart,
    handleOpenSchedule,
    handleToggleHour,
    handleSetDailyLimit,
    handleSetModeInterval,
    handleManualLimit
} = require('./channel_modules/schedule');
const {
    handleEditPromptMenu, handleLockedAiFeature,
    handleStartEditPrompt, handleResetPrompt
} = require('./channel_modules/aiPrompt');
const {
    handleCheckOne, handleForceCheckAll,
    handleDeleteConfirmMenu, handleConfirmDelete, handleToggleActive
} = require('./channel_modules/lifecycle');
const { handleScheduledPosts } = require('./channel_modules/scheduledPosts');


const channelHandler = async (bot, query, user, callbacks) => {
    const { data } = query;

    try {
        // --- Заплановані пости (sp_*) ---
        if (data.startsWith('sp_')) {
            return await handleScheduledPosts(bot, query, user, callbacks);
        }

        // --- Додавання TG джерела ---
        if (data.startsWith('add_tgsrc_')) {
            return await handleAddSourceStart(bot, query);
        }
        if (data.startsWith('set_limit_')) {
            return await handleSetDailyLimit(bot, query, user);
        }
        if (data.startsWith('manual_limit_')) {
            return await handleManualLimitStart(bot, query);
        }
        if (data === 'noop') {
            return bot.answerCallbackQuery(query.id);
        }

        // --- Список каналів ---
        if (data === 'list_channels') {
            return await handleListChannels(bot, query, user);
        }

        // --- Меню налаштувань каналу ---
        if (data.startsWith('manage_') || data.startsWith('menu_settings_')) {
            return await handleManageChannel(bot, query, user);
        }

        // --- Список джерел ---
        if (data.startsWith('sources_list_')) {
            return await handleSourcesList(bot, query);
        }
        if (data.startsWith('remove_tgsrc_')) {
            return await handleRemoveSource(bot, query);
        }

        // --- Інтервали ---
        if (data.startsWith('edit_interval_')) {
            return await handleEditIntervalMenu(bot, query);
        }
        if (data.startsWith('set_int_')) {
            return await handleSetInterval(bot, query, user);
        }

        // --- Перевірка каналів ---
        if (data.startsWith('check_one_')) {
            return await handleCheckOne(bot, query, user);
        }
        if (data === 'force_check_all') {
            return await handleForceCheckAll(bot, query, user);
        }

        // --- AI Промпти ---
        if (data.startsWith('edit_prompt_')) {
            return await handleEditPromptMenu(bot, query, user);
        }
        if (data === 'locked_feature_ai') {
            return await handleLockedAiFeature(bot, query);
        }
        if (data.startsWith('start_edit_prompt_')) {
            return await handleStartEditPrompt(bot, query);
        }
        if (data.startsWith('reset_prompt_')) {
            return await handleResetPrompt(bot, query);
        }

        // --- Видалення каналу ---
        if (data.startsWith('del_')) {
            return await handleDeleteConfirmMenu(bot, query);
        }
        if (data.startsWith('confirm_del_')) {
            return await handleConfirmDelete(bot, query, user, callbacks);
        }

        // --- Toggle (запуск/пауза) ---
        if (data.startsWith('user_ch_toggle_')) {
            return await handleToggleActive(bot, query, user);
        }

        // --- Розклад ---
        if (data.startsWith('open_schedule_')) {
            return await handleOpenSchedule(bot, query);
        }
        if (data.startsWith('toggle_hour_')) {
            return await handleToggleHour(bot, query);
        }
        if (data.startsWith('set_mode_interval_')) {
            return await handleSetModeInterval(bot, query);
        }
        if (data.startsWith('manual_int_')) {
            return await handleManualIntervalStart(bot, query);
        }

    } catch (error) {
        console.error('❌ Channels Handler Error:', error);
    }
};

module.exports = channelHandler;