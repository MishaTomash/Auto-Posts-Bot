const Channel = require('../models/Channel');
const Post = require('../models/Post');
const { rewriteNews, sanitizeForTelegram, checkIsAdvertisement } = require('./aiService');
const { getUnsplashImage } = require('./imageService');
const { getLatestPosts } = require('./tgParserService');
const fs = require('fs');
const path = require('path');
const os = require('os');
const User = require('../models/User');

// services/postService.js

const processSingleChannel = async (bot, channel) => {
    const user = channel.userId;
    if (!user || typeof user === 'string') {
        console.error("❌ Помилка: Юзер не завантажений (забудь .populate('userId'))");
        return false;
    }

    if (!user.dailyPostStats) {
        user.dailyPostStats = { date: new Date().toISOString().split('T')[0], count: 0 };
    }

    // 1. Скидання лімітів
    const today = new Date().toISOString().split('T')[0];
    if (user.dailyPostStats.date !== today) {
        user.dailyPostStats.date = today;
        user.dailyPostStats.count = 0;
        await user.save();
    }

    // 2. Перевірка ліміту (Додаємо ?. щоб не було помилки)
    const maxPosts = user.subscription?.maxPostsPerDay || 5; // 5 - дефолт, якщо впала база

    if (user.dailyPostStats.count >= maxPosts) {
        console.log(`⚠️ Ліміт вичерпано для користувача ${user.telegramId}`);
        return false;
    }

    // 3. Визначаємо промпт
    const sub = user.subscription;
    const plan = sub?.plan?.toLowerCase() || 'free';
    const isAiAllowed = sub?.hasCustomPrompt === true || (plan !== 'free' && plan !== 'none');

    return isAiAllowed ? channel.aiPrompt : null;
};

// services/postService.js


const bufferToTempFile = async (buffer, mediaType) => {
    const ext = mediaType === 'photo' ? 'jpg' : 'mp4';
    const tmpPath = path.join(os.tmpdir(), `tg_media_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
    await fs.promises.writeFile(tmpPath, buffer);
    return tmpPath;
};
// services/postService.js

let isProcessing = false;
const isPostAdvertisement = async (post) => {
    // Збираємо весь текст поста в одне місце
    const textParts = [];

    if (post.text) textParts.push(post.text);

    // Для альбомів перевіряємо підпис першого елемента
    if (post.isGroup && post.items?.[0]?.text) {
        textParts.push(post.items[0].text);
    }

    const fullText = textParts.join('\n').trim();
    if (!fullText) return false; // Немає тексту — пропускаємо перевірку

    return await checkIsAdvertisement(fullText);
};
// 1. Перевіряє чи вичерпано ліміт постів
// ─────────────────────────────────────────────
const checkLimit = (user) => {
    return user.dailyPostStats.count >= (user.subscription?.maxPostsPerDay || 5);
};

// ─────────────────────────────────────────────
// 2. Фільтрує канали за розкладом / інтервалом
// ─────────────────────────────────────────────
const filterChannels = (channels, now, specificUserId) => {
    const currentHour = now.getHours();

    return channels.filter(ch => {
        if (specificUserId) return true;

        if (ch.scheduleMode === 'daily') {
            if (!ch.dailySchedule?.includes(currentHour)) return false;
            if (ch.lastCheckAt) {
                const last = new Date(ch.lastCheckAt);
                if (last.getHours() === currentHour && last.getDate() === now.getDate()) return false;
            }
            return true;
        }

        if (!ch.lastCheckAt || ch.lastCheckAt.getTime() === 0) return true;
        const nextCheck = new Date(ch.lastCheckAt.getTime() + ch.checkInterval * 60000);
        return now >= nextCheck;
    });
};

// ─────────────────────────────────────────────
// 3. Завантажує нові пости й ставить закладку при ініціалізації
// ─────────────────────────────────────────────
const fetchNewPosts = async (channel, source) => {
    const newPosts = await getLatestPosts(source.url, source.lastMessageId);

    if (newPosts.length === 1 && newPosts[0].isInitial) {
        await Channel.updateOne(
            { _id: channel._id, "tgSources.url": source.url },
            { $set: { "tgSources.$.lastMessageId": newPosts[0].maxId } }
        );
        console.log(`🆕 [INIT] Закладка встановлена на ID: ${newPosts[0].maxId}`);
        return [];
    }

    return newPosts ?? [];
};

// ─────────────────────────────────────────────
// 4. Надсилає альбом (група медіа)
// ─────────────────────────────────────────────
const sendAlbum = async (bot, targetId, post, promptToUse) => {
    const tmpFiles = [];
    const mediaGroup = [];

    for (let i = 0; i < post.items.length; i++) {
        const item = post.items[i];
        if (!item.media) continue;

        const tmpPath = await bufferToTempFile(item.media, item.mediaType);
        tmpFiles.push(tmpPath);

        const mediaItem = {
            type: item.mediaType === 'photo' ? 'photo' : 'video',
            media: fs.createReadStream(tmpPath),
        };

        if (i === 0 && item.text) {
            const aiCaption = await rewriteNews("", item.text, promptToUse);
            mediaItem.caption = sanitizeForTelegram(aiCaption).substring(0, 1024);
            mediaItem.parse_mode = 'HTML';
        }

        mediaGroup.push(mediaItem);
    }

    if (mediaGroup.length > 0) {
        await bot.sendMediaGroup(targetId, mediaGroup);
    }

    tmpFiles.forEach(f => fs.unlink(f, () => { }));
    return mediaGroup.length > 0;
};

// ─────────────────────────────────────────────
// 5. Надсилає одиночний пост (фото / відео / текст)
// ─────────────────────────────────────────────
const sendSingle = async (bot, targetId, post, promptToUse) => {
    let aiText = post.text ? await rewriteNews("", post.text, promptToUse) : "";
    const safeText = aiText ? sanitizeForTelegram(aiText) : "";
    const options = { caption: safeText.substring(0, 1024), parse_mode: 'HTML' };

    if (post.media) {
        const tmpPath = await bufferToTempFile(post.media, post.mediaType);
        const stream = fs.createReadStream(tmpPath);

        if (post.mediaType === 'photo') await bot.sendPhoto(targetId, stream, options);
        else if (post.mediaType === 'video') await bot.sendVideo(targetId, stream, options);
        else await bot.sendDocument(targetId, stream, options);

        fs.unlink(tmpPath, () => { });
        return true;
    }

    if (safeText) {
        await bot.sendMessage(targetId, safeText, { parse_mode: 'HTML' });
        return true;
    }

    return false;
};

// ─────────────────────────────────────────────
// 6. Публікує один пост: перевірка дублів + відправка
// ─────────────────────────────────────────────
const publishPost = async (bot, channel, source, post, user, promptToUse) => {
    const postLink = post.isGroup
        ? `${source.url}/${post.maxId}`
        : `${source.url}/${post.id}`;

    const postExists = await Post.findOne({ channelId: channel.channelId, originalLink: postLink });
    if (postExists) return;

    try {
        const targetId = channel.channelId;
        const success = post.isGroup
            ? await sendAlbum(bot, targetId, post, promptToUse)
            : await sendSingle(bot, targetId, post, promptToUse);

        if (success) {
            await finishPost(channel, source, post.isGroup ? post.maxId : post.id, postLink, user);
            console.log(`✅ Пост ${postLink} успішно опубліковано.`);
        }
    } catch (sendError) {
        console.error(`❌ Помилка відправки:`, sendError.message);
        await Channel.updateOne(
            { _id: channel._id, "tgSources.url": source.url },
            { $set: { "tgSources.$.lastMessageId": post.isGroup ? post.maxId : post.id } }
        );
    }
};

// ─────────────────────────────────────────────
// 7. Обробляє одне джерело (tgSource) для каналу
// ─────────────────────────────────────────────
const processSource = async (bot, channel, source, user, promptToUse) => {
    try {
        console.log(`📡 Джерело: ${source.url} (Last ID: ${source.lastMessageId})`);

        const newPosts = await fetchNewPosts(channel, source);
        if (newPosts.length === 0) return;

        console.log(`📨 Знайдено нових постів: ${newPosts.length}`);

        for (const post of newPosts) {
            // --- Ліміт користувача (підписка) ---
            if (checkLimit(user)) {
                console.log(`🛑 Ліміт підписки вичерпано для ${user.telegramId}`);
                break;
            }

            // --- Ліміт каналу на день ---
            const freshChannel = await Channel.findById(channel._id);
            const channelLimit = freshChannel.dailyPostLimit ?? 10;
            const channelUsed  = freshChannel.todayPostCount  ?? 0;

            if (channelUsed >= channelLimit) {
                console.log(`🛑 Денний ліміт каналу ${channel.channelUsername} вичерпано (${channelUsed}/${channelLimit})`);

                // Повідомляємо адміна (лише один раз — коли лічильник рівно дорівнює ліміту)
                if (channelUsed === channelLimit) {
                    await bot.sendMessage(
                        user.telegramId,
                        `⚠️ <b>Ліміт постів досягнуто</b>\n` +
                        `Канал <b>${channel.channelUsername}</b> опублікував ${channelLimit} постів сьогодні.\n` +
                        `Публікації відновляться завтра о 00:00.`,
                        { parse_mode: 'HTML' }
                    ).catch(() => {});
                }
                break;
            }
            // ─────────────────────────────────────

            // --- Фільтр реклами ---
            const isAd = await isPostAdvertisement(post);
            if (isAd) {
                console.log(`⏩ Рекламу пропущено: ${source.url}`);
                await Channel.updateOne(
                    { _id: channel._id, "tgSources.url": source.url },
                    { $set: { "tgSources.$.lastMessageId": post.isGroup ? post.maxId : post.id } }
                );
                continue;
            }
            // ─────────────────────

            await publishPost(bot, channel, source, post, user, promptToUse);
        }
    } catch (err) {
        console.error(`❌ Помилка джерела ${source.url}:`, err.message);
    }
};

// ─────────────────────────────────────────────
// 8. Головна функція — тонка оркестрація
// ─────────────────────────────────────────────
const processNews = async (bot, specificUserId = null) => {
    if (isProcessing) return;

    try {
        isProcessing = true;
        const now = new Date();

        const query = { isActive: true };
        if (specificUserId) query.userId = specificUserId;

        const allActiveChannels = await Channel.find(query).populate('userId');
        const channels = filterChannels(allActiveChannels, now, specificUserId);

        if (channels.length === 0) return;
        console.log(`🔍 [LOG] Перевірка для ${channels.length} каналів.`);

        for (const channel of channels) {
            console.log(`🔹 Проєкт: ${channel.channelUsername}`);
            await Channel.findByIdAndUpdate(channel._id, { lastCheckAt: now });

            const promptToUse = await processSingleChannel(bot, channel);
            if (promptToUse === false) continue;

            for (const source of channel.tgSources ?? []) {
                await processSource(bot, channel, source, channel.userId, promptToUse);
            }
        }
    } catch (err) {
        console.error("❌ Глобальна помилка processNews:", err.message);
    } finally {
        isProcessing = false;
    }
};

/**
 * Допоміжна функція для завершення посту: збереження в БД та оновлення лімітів
 */
async function finishPost(channel, source, lastId, link, user) {
    source.lastMessageId = lastId;
    await Channel.updateOne(
        { _id: channel._id, "tgSources.url": source.url },
        { $set: { "tgSources.$.lastMessageId": lastId } }
    );

    await Post.create({
        channelId: channel.channelId,
        originalLink: link,
        userId: user._id
    });

    // Ліміт користувача (підписка)
    await User.findByIdAndUpdate(user._id, { $inc: { 'dailyPostStats.count': 1 } });
    user.dailyPostStats.count++;

    // Ліміт каналу на день
    await Channel.findByIdAndUpdate(channel._id, { $inc: { todayPostCount: 1 } });
}



module.exports = { processNews, processSingleChannel, processSource };