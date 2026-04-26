const Channel = require('../models/Channel');
const Post = require('../models/Post');
const { rewriteNews, sanitizeForTelegram } = require('./aiService');
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

const processNews = async (bot, specificUserId = null) => {
    if (isProcessing) return;

    try {
        isProcessing = true;
        const now = new Date();

        const query = { isActive: true };
        if (specificUserId) query.userId = specificUserId;

        const allActiveChannels = await Channel.find(query).populate('userId');

        const channels = allActiveChannels.filter(ch => {
            // Якщо натиснуто "Перевірити зараз", ми ігноруємо таймер (specificUserId передається при кліку)
            if (specificUserId) return true; 
            if (!ch.lastCheckAt || ch.lastCheckAt.getTime() === 0) return true;

            const nextCheck = new Date(ch.lastCheckAt.getTime() + ch.checkInterval * 60000);
            return now >= nextCheck;
        });

        if (channels.length === 0) return;

        console.log(`🔍 Настав час перевірки для ${channels.length} каналів.`);

        for (const channel of channels) {
            await Channel.findByIdAndUpdate(channel._id, { lastCheckAt: now });

            const promptToUse = await processSingleChannel(bot, channel);
            if (promptToUse === false) continue;

            const user = channel.userId;

            if (channel.tgSources?.length > 0) {
                for (let source of channel.tgSources) {
                    try {
                        const newPosts = await getLatestPosts(source.url, source.lastMessageId);

                        if (newPosts.length === 1 && newPosts[0].isInitial) {
                            await Channel.updateOne(
                                { _id: channel._id, "tgSources.url": source.url },
                                { $set: { "tgSources.$.lastMessageId": newPosts[0].maxId } }
                            );
                            continue;
                        }

                        if (!newPosts || newPosts.length === 0) continue;

                        for (const post of newPosts) {
                            if (user.dailyPostStats.count >= user.subscription.maxPostsPerDay) break;

                            const postLink = post.isGroup
                                ? `${source.url}/${post.maxId}`
                                : `${source.url}/${post.id}`;

                            const postExists = await Post.findOne({ channelId: channel.channelId, originalLink: postLink });
                            if (postExists) continue;

                            try {
                                const targetId = channel.channelId;
                                if (post.isGroup) {
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
                                            if (aiCaption) {
                                                mediaItem.caption = sanitizeForTelegram(aiCaption).substring(0, 1024);
                                                mediaItem.parse_mode = 'HTML';
                                            }
                                        }
                                        mediaGroup.push(mediaItem);
                                    }

                                    if (mediaGroup.length > 0) {
                                        await bot.sendMediaGroup(targetId, mediaGroup);
                                        await finishPost(channel, source, post.maxId, postLink, user);
                                    }
                                    tmpFiles.forEach(f => fs.unlink(f, () => { }));

                                } else {
                                    let aiText = post.text ? await rewriteNews("", post.text, promptToUse) : "";
                                    const safeText = aiText ? sanitizeForTelegram(aiText) : "";

                                    if (post.media) {
                                        const tmpPath = await bufferToTempFile(post.media, post.mediaType);
                                        const stream = fs.createReadStream(tmpPath);
                                        const options = { caption: safeText.substring(0, 1024), parse_mode: 'HTML' };

                                        if (post.mediaType === 'photo') await bot.sendPhoto(targetId, stream, options);
                                        else if (post.mediaType === 'video') await bot.sendVideo(targetId, stream, options);
                                        else await bot.sendDocument(targetId, stream, options);

                                        fs.unlink(tmpPath, () => { });
                                    } else if (safeText) {
                                        await bot.sendMessage(targetId, safeText, { parse_mode: 'HTML' });
                                    }
                                    await finishPost(channel, source, post.id, postLink, user);
                                }
                            } catch (err) {
                                console.error(`❌ Помилка публікації поста:`, err.message);
                                // Важливо: якщо пост не пішов, ми все одно зміщуємо ID, щоб не було циклу
                                const currentId = post.isGroup ? post.maxId : post.id;
                                await Channel.updateOne(
                                    { _id: channel._id, "tgSources.url": source.url },
                                    { $set: { "tgSources.$.lastMessageId": currentId } }
                                );
                            }
                        }
                    } catch (sourceErr) {
                        console.error(`❌ Помилка джерела ${source.url}:`, sourceErr.message);
                    }
                }
            }
        }
    } catch (globalErr) {
        console.error("❌ Глобальна помилка processNews:", globalErr.message);
    } finally {
        isProcessing = false;
    }
};

/**
 * Допоміжна функція для завершення посту: збереження в БД та оновлення лімітів
 */
async function finishPost(channel, source, lastId, link, user) {
    // Оновлюємо останній ID джерела в пам'яті та БД
    source.lastMessageId = lastId;
    await Channel.updateOne(
        { _id: channel._id, "tgSources.url": source.url },
        { $set: { "tgSources.$.lastMessageId": lastId } }
    );

    // Створюємо запис про пост
    await Post.create({
        channelId: channel.channelId,
        originalLink: link,
        userId: user._id
    });

    // Оновлюємо ліміти користувача
    await User.findByIdAndUpdate(user._id, { $inc: { 'dailyPostStats.count': 1 } });
    user.dailyPostStats.count++;
}

module.exports = { processNews, processSingleChannel };