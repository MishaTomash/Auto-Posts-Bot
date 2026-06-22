// services/scheduledPostService.js
// Публікація запланованих постів та авто-видалення.

const ScheduledPost = require('../models/ScheduledPost');
const Channel       = require('../models/Channel');

// ─── Опублікувати один запланований пост ─────────────────────────────────────
const publishScheduledPost = async (bot, post) => {
    try {
        const targetId = post.telegramChannelId;
        let sentMsg = null;

        if (post.mediaFileId && post.mediaType === 'photo') {
            sentMsg = await bot.sendPhoto(targetId, post.mediaFileId, {
                caption:    post.text ? post.text.substring(0, 1024) : undefined,
                parse_mode: 'HTML'
            });
        } else if (post.mediaFileId && post.mediaType === 'video') {
            sentMsg = await bot.sendVideo(targetId, post.mediaFileId, {
                caption:    post.text ? post.text.substring(0, 1024) : undefined,
                parse_mode: 'HTML'
            });
        } else if (post.text) {
            sentMsg = await bot.sendMessage(targetId, post.text, { parse_mode: 'HTML' });
        }

        if (!sentMsg) {
            post.status = 'failed';
            await post.save();
            console.warn(`⚠️ Пост ${post._id} не опубліковано: порожній вміст`);
            return;
        }

        post.status              = 'published';
        post.publishedMessageId  = sentMsg.message_id;

        // Встановлюємо час авто-видалення
        if (post.deleteAfterMin > 0) {
            post.deleteAt = new Date(Date.now() + post.deleteAfterMin * 60000);
        }

        await post.save();

        // Блокуємо авто-пости (pinnedUntil) якщо задано пріоритет
        if (post.pinDurationMin > 0) {
            const pinnedUntil = new Date(Date.now() + post.pinDurationMin * 60000);
            await Channel.findByIdAndUpdate(post.channelId, { pinnedUntil });
            console.log(`📌 Пріоритет встановлено до: ${pinnedUntil.toLocaleTimeString('uk-UA')}`);
        }

        console.log(`✅ Запланований пост опублікований: ${post._id}`);
    } catch (err) {
        console.error(`❌ Помилка публікації поста ${post._id}:`, err.message);
        post.status = 'failed';
        await post.save();
    }
};

// ─── Перевірити та опублікувати всі пости, час яких настав ───────────────────
const checkScheduledPosts = async (bot) => {
    const now = new Date();
    try {
        const posts = await ScheduledPost.find({
            status:      'pending',
            scheduledAt: { $lte: now }
        });

        if (posts.length > 0) {
            console.log(`📅 Знайдено ${posts.length} постів для публікації`);
        }

        for (const post of posts) {
            await publishScheduledPost(bot, post);
        }
    } catch (err) {
        console.error('❌ checkScheduledPosts:', err.message);
    }
};

// ─── Перевірити та видалити пости, час яких минув ────────────────────────────
const checkDeletions = async (bot) => {
    const now = new Date();
    try {
        const posts = await ScheduledPost.find({
            status:    'published',
            isDeleted: { $ne: true },
            deleteAt:  { $ne: null, $lte: now }
        });

        for (const post of posts) {
            try {
                await bot.deleteMessage(post.telegramChannelId, post.publishedMessageId);
                post.isDeleted = true;
                post.deleteAt  = null;
                await post.save();
                console.log(`🗑 Пост видалено: ${post._id}`);
            } catch (err) {
                console.error(`❌ Не вдалося видалити пост ${post._id}:`, err.message);
                // Більше не намагатись — скидаємо deleteAt
                post.deleteAt = null;
                await post.save();
            }
        }
    } catch (err) {
        console.error('❌ checkDeletions:', err.message);
    }
};

module.exports = { checkScheduledPosts, checkDeletions, publishScheduledPost };