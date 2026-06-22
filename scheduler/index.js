// scheduler/index.js
// Планувальник запланованих постів.
// Викликається з bot/index.js при старті бота.

const { checkScheduledPosts, checkDeletions } = require('../services/scheduledPostService');

let _bot  = null;
let _timer = null;

const initScheduledPostsScheduler = (bot) => {
    if (_timer) return; // Вже запущено
    _bot = bot;

    _timer = setInterval(async () => {
        try {
            await checkScheduledPosts(_bot);
            await checkDeletions(_bot);
        } catch (err) {
            console.error('❌ Scheduler tick error:', err.message);
        }
    }, 60 * 1000); // Кожну хвилину

    console.log('📅 Scheduler запланованих постів активовано');
};

module.exports = { initScheduledPostsScheduler };