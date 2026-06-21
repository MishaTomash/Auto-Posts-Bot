// bot/callbacks/admin.js
//
// Роутер адмін-колбеків. Делегує обробку у відповідні підмодулі в ./admin_modules/.

const { ensureAdmin } = require('./admin_modules/_guard');

const { handleDashboard } = require('./admin_modules/dashboard');

const {
    handleUsersList,
    handleUserSearchStart,
    handleUserView,
    handleUserDeleteRequest,
    handleUserDeleteConfirm,
    handleUserPlanMenu,
    handleSetPlan
} = require('./admin_modules/users');

const {
    handlePlansList,
    handlePlanView,
    handlePlanToggleAi,
    handlePlanEditField
} = require('./admin_modules/plans');

const {
    handleChannelsList,
    handleChannelView,
    handleChannelDelete,
    handleChannelToggle,
    handleChannelSourcesView,
    handleSourceDelete,
    handleSourceView
} = require('./admin_modules/channels');

const { handleBroadcastStart, handleBroadcastFinal } = require('./admin_modules/broadcast');
const { handleLogsErrors, handleExportUsers }        = require('./admin_modules/logsExport');
const { handlePaymentConfirm, handlePaymentReject }  = require('./admin_modules/payments');

const adminHandler = async (bot, query, user, callbackHandler) => {
    const { data } = query;

    const allowed = await ensureAdmin(bot, query, user);
    if (!allowed) return;

    try {
        // --- Дашборд ---
        if (data === 'admin_dashboard' || data === 'admin_main') {
            return await handleDashboard(bot, query, user);
        }

        // --- Користувачі ---
        if (data === 'admin_users' || data.startsWith('admin_users_page_')) {
            return await handleUsersList(bot, query);
        }
        if (data === 'admin_user_search') {
            return await handleUserSearchStart(bot, query);
        }
        if (data.startsWith('admin_user_view_')) {
            return await handleUserView(bot, query);
        }
        if (data.startsWith('admin_user_delete_request_')) {
            return await handleUserDeleteRequest(bot, query);
        }
        if (data.startsWith('admin_confirm_')) {
            return await handleUserDeleteConfirm(bot, query);
        }
        if (data.startsWith('admin_user_plan_')) {
            return await handleUserPlanMenu(bot, query);
        }
        if (data.startsWith('admin_set_plan_')) {
            return await handleSetPlan(bot, query, user, callbackHandler);
        }

        // --- Тарифи ---
        if (data === 'admin_plans') {
            return await handlePlansList(bot, query);
        }
        if (data.startsWith('admin_plan_view_')) {
            return await handlePlanView(bot, query);
        }
        if (data.startsWith('admin_plan_edit_ai_')) {
            return await handlePlanToggleAi(bot, query);
        }
        if (data.startsWith('admin_plan_edit_') && !data.includes('_ai_')) {
            return await handlePlanEditField(bot, query);
        }

        // --- Канали ---
        if (
            data === 'admin_channels' ||
            data === 'admin_channels_list' ||
            data.startsWith('admin_ch_page_')
        ) {
            return await handleChannelsList(bot, query);
        }
        if (data.startsWith('admin_ch_view_')) {
            return await handleChannelView(bot, query);
        }
        if (data.startsWith('admin_ch_delete_')) {
            return await handleChannelDelete(bot, query);
        }
        if (data.startsWith('admin_ch_toggle_')) {
            return await handleChannelToggle(bot, query, user);
        }
        if (data.startsWith('admin_ch_sources_')) {
            return await handleChannelSourcesView(bot, query);
        }
        if (data.startsWith('admin_src_del_')) {
            return await handleSourceDelete(bot, query);
        }
        if (data.startsWith('admin_src_view_tg_')) {
            return await handleSourceView(bot, query);
        }

        // --- Розсилка ---
        if (data === 'admin_broadcast') {
            return await handleBroadcastStart(bot, query);
        }
        if (data === 'admin_bc_start_final') {
            return await handleBroadcastFinal(bot, query);
        }

        // --- Логи та експорт ---
        if (data === 'admin_logs_errors') {
            return await handleLogsErrors(bot, query);
        }
        if (data === 'admin_export_users') {
            return await handleExportUsers(bot, query);
        }

        // --- Ручні платежі (Monobank) ---
        if (data.startsWith('payment_confirm_')) {
            return await handlePaymentConfirm(bot, query);
        }
        if (data.startsWith('payment_reject_')) {
            return await handlePaymentReject(bot, query);
        }

    } catch (error) {
        console.error('🔴 Admin Handler Critical Error:', error);
        return bot.answerCallbackQuery(query.id, {
            text: '⚠️ Помилка: ' + error.message, show_alert: true
        });
    }
};

module.exports = adminHandler;