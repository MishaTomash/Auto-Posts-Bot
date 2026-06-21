// bot/callbacks/instructions.js
//
// Обробник колбеків довідки. Текстовий контент кроків винесено в
// ./instructions_content.js (STEPS) — тут залишена лише логіка побудови
// клавіатури та рендеру.

const { STEPS } = require('./instructions_content');

const buildKeyboard = (step) => {
    if (step.keyboard) return step.keyboard;   // Головне меню інструкцій

    return [
        [{ text: '📖 До змісту інструкції', callback_data: step.back }],
        [{ text: '🏠 Головне меню',         callback_data: 'main_menu' }]
    ];
};

const instructionsHandler = async (bot, query) => {
    const chatId    = query.message.chat.id;
    const data      = query.data;
    const messageId = query.message.message_id;

    const stepMap = {
        'instr_main':          STEPS.main,
        'instr_step_prepare':  STEPS.prepare,
        'instr_step_create':   STEPS.create,
        'instr_step_sources':  STEPS.sources,
        'instr_step_interval': STEPS.interval,
        'instr_step_prompt':   STEPS.prompt,
        'instr_step_launch':   STEPS.launch,
        'instr_step_tips':     STEPS.tips,
    };

    const step = stepMap[data];
    if (!step) return;

    await bot.editMessageText(step.text, {
        chat_id:     chatId,
        message_id:  messageId,
        parse_mode:  'HTML',
        reply_markup: { inline_keyboard: buildKeyboard(step) }
    }).catch(err => {
        if (!err.message.includes('message is not modified')) console.error('Instructions render error:', err.message);
    });
};

module.exports = instructionsHandler;