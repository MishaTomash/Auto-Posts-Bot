const Channel = require('../models/Channel');
const Post = require('../models/Post');
const { fetchNews } = require('./rssService');
const { rewriteNews, sanitizeForTelegram } = require('./aiService');
const { getImageForPost } = require('./imageService');
const { fetchRawJson, getHash } = require('./jsonService');
const { getLatestPosts } = require('./tgParserService');
const fs = require('fs');
const path = require('path');
const os = require('os');

const processJsonSources = async (bot, channel, user) => {
    if (!channel.jsonSources?.length) return;

    // ВИЗНАЧАЄМО ПРОМПТ: якщо є підписка — беремо з каналу, якщо ні — стандарт
    const promptToUse = user.subscription?.hasCustomPrompt && channel.aiPrompt
        ? channel.aiPrompt
        : "Перетвори цей JSON на гарний пост для Telegram.";

    for (const source of channel.jsonSources) {
        try {
            if (user.dailyPostStats.count >= user.subscription.maxPostsPerDay) {
                console.log(`🛑 Ліміт постів досягнуто для JSON`);
                break;
            }

            const rawData = await fetchRawJson(source.url);
            if (!rawData) continue;

            const currentHash = getHash(rawData);
            const storedHash = source.lastDataHash || null;
            if (storedHash && storedHash === currentHash) continue;

            console.log(`🤖 AI обробляє JSON для: ${source.label}`);

            const content = `Джерело: ${source.label}\nДані: ${JSON.stringify(rawData)}`;

            // Передаємо вже визначений promptToUse
            const aiText = await rewriteNews("Оновлення даних", content, promptToUse);
            if (!aiText) continue;

            const safeText = sanitizeForTelegram(aiText);
            await bot.sendMessage(channel.channelId, safeText, { parse_mode: 'HTML' });

            // Оновлення лімітів та хешу...
            await User.findByIdAndUpdate(user._id, { $inc: { 'dailyPostStats.count': 1 } });
            user.dailyPostStats.count++;

            await Channel.updateOne(
                { _id: channel._id, "jsonSources.url": source.url },
                { $set: { "jsonSources.$.lastDataHash": currentHash } }
            );

        } catch (e) {
            console.error(`❌ Помилка JSON:`, e.message);
        }
    }
};

const processSingleChannel = async (bot, channel) => {
    const User = require('../models/User');
    const user = await User.findById(channel.userId);

    if (!user) return;
    console.log("Перевіряємо для юзера:", user._id);

    // Скидання лімітів (твій код)...
    const today = new Date().toISOString().split('T')[0];
    if (user.dailyPostStats.date !== today) {
        user.dailyPostStats.date = today;
        user.dailyPostStats.count = 0;
        await user.save();
    }

    if (user.dailyPostStats.count >= user.subscription.maxPostsPerDay) return;

    // ВИЗНАЧАЄМО ПРОМПТ ДЛЯ RSS:
    // Якщо у юзера в підписці hasCustomPrompt === true, передаємо його промпт.
    // Якщо false — передаємо null, щоб aiService використав DEFAULT_PROMPT.
    const sub = user.subscription;
    const plan = sub?.plan?.toLowerCase() || 'free';

    // Тепер перевіряємо: або стоїть галочка, або тариф НЕ безкоштовний
    const isAiAllowed = sub?.hasCustomPrompt === true || (plan !== 'free' && plan !== 'none');

    const promptToUse = isAiAllowed ? channel.aiPrompt : null;

    console.log(`📡 Канал: ${channel.channelUsername} | Промпт: ${promptToUse ? 'Custom' : 'Default'}`);

    // Оновлення часу перевірки...
    await Channel.findByIdAndUpdate(channel._id, { lastCheckAt: new Date() });

    if (channel.rssUrls?.length > 0) {
        for (const url of channel.rssUrls) {
            try {
                const newsItems = await fetchNews(url);
                if (!newsItems) continue;

                for (const item of newsItems.slice(0, 3)) {
                    if (user.dailyPostStats.count >= user.subscription.maxPostsPerDay) break;

                    const postExists = await Post.findOne({ channelId: channel.channelId, originalLink: item.link });
                    if (postExists) continue;

                    const aiText = await rewriteNews(item.title, item.content, promptToUse);
                    if (!aiText) continue;

                    const safeText = sanitizeForTelegram(aiText);
                    const imageUrl = await getImageForPost(item.imageUrl, item.title);
                    const caption = `${safeText}\n\n<a href="${item.link}">👉 Читати повністю</a>`;

                    try {
                        // 1. СПОЧАТКУ СТВОРЮЄМО ЗАПИС (Пам'ять)
                        // Тепер channelId — це рядок, тому помилки не буде
                        await Post.create({
                            channelId: channel.channelId,
                            originalLink: item.link,
                            aiText: safeText,
                            userId: user._id
                        });

                        // 2. ВІДПРАВЛЯЄМО В ТЕЛЕГРАМ
                        if (imageUrl) {
                            await bot.sendPhoto(channel.channelId, imageUrl, { caption: caption.substring(0, 1024), parse_mode: 'HTML' });
                        } else {
                            await bot.sendMessage(channel.channelId, caption, { parse_mode: 'HTML' });
                        }

                        // 3. ОНОВЛЮЄМО ЛІЧИЛЬНИК
                        await User.findByIdAndUpdate(user._id, { $inc: { 'dailyPostStats.count': 1 } });
                        user.dailyPostStats.count++;

                        console.log(`✅ Успішно запощено і враховано: ${item.title}`);

                    } catch (err) {
                        // Якщо це помилка дубліката (E11000), ми її просто ігноруємо
                        if (err.code === 11000) {
                            console.log("⏭ Пост вже існує, пропуск.");
                        } else {
                            console.error(`❌ Помилка при збереженні/відправці:`, err.message);
                        }
                    }
                }
            } catch (err) {
                console.error(`❌ RSS помилка:`, err.message);
            }
        }
    }

    if (user.dailyPostStats.count < user.subscription.maxPostsPerDay) {
        await processJsonSources(bot, channel, user);
    }
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
    if (isProcessing) {
        console.log('⏳ Попередня перевірка ще триває, пропускаємо...');
        return;
    }

    try {
        const query = { isActive: true };
        isProcessing = true
        if (specificUserId) query.userId = specificUserId;

        const channels = await Channel.find(query).populate('userId');
        console.log(`🔍 Перевірка ${channels.length} каналів...`);

        for (const channel of channels) {
            // 1. Обробка RSS
            await processSingleChannel(bot, channel).catch(err =>
                console.error(`❌ Помилка RSS для ${channel.channelUsername}:`, err.message)
            );

            // 2. Обробка Telegram-джерел
            if (channel.tgSources && channel.tgSources.length > 0) {
                const User = require('../models/User');
                const user = await User.findById(channel.userId);
                if (!user) continue;

                for (let source of channel.tgSources) {
                    const newPosts = await getLatestPosts(source.url, source.lastMessageId);
                    if (!newPosts || newPosts.length === 0) continue;

                    for (const post of newPosts) {
                        // Перевірка лімітів підписки
                        if (user.dailyPostStats.count >= user.subscription.maxPostsPerDay) {
                            console.log(`🛑 Ліміт постів досягнуто для юзера ${user.telegramId}`);
                            break;
                        }

                        try {
                            const targetId = channel.channelId;

                            if (post.isGroup) {
                                // --- ОБРОБКА АЛЬБОМУ ---
                                console.log(`📦 Формуємо альбом із ${post.items.length} елементів...`);
                                const tmpFiles = [];
                                const mediaGroup = [];

                                try {
                                    for (let i = 0; i < post.items.length; i++) {
                                        const item = post.items[i];
                                        if (!item.media || !item.mediaType) continue;

                                        const tmpPath = await bufferToTempFile(item.media, item.mediaType);
                                        tmpFiles.push(tmpPath);

                                        const mediaItem = {
                                            type: item.mediaType === 'photo' ? 'photo' : 'video',
                                            media: fs.createReadStream(tmpPath),
                                            fileOptions: {
                                                filename: item.mediaType === 'photo' ? 'image.jpg' : 'video.mp4',
                                                contentType: item.mediaType === 'photo' ? 'image/jpeg' : 'video/mp4',
                                            }
                                        };

                                        // Додаємо опис тільки до першого медіа в альбомі
                                        if (i === 0 && item.text) {
                                            const aiCaption = await rewriteNews("", item.text, channel.aiPrompt || null);
                                            if (aiCaption) {
                                                mediaItem.caption = aiCaption.substring(0, 1024);
                                                mediaItem.parse_mode = 'HTML';
                                            }
                                        }
                                        mediaGroup.push(mediaItem);
                                    }

                                    if (mediaGroup.length > 0) {
                                        await bot.sendMediaGroup(targetId, mediaGroup);
                                        console.log(`✅ Альбом (ID до ${post.maxId}) репостнуто.`);

                                        // Оновлюємо ID останнього обробленого повідомлення
                                        await Channel.updateOne(
                                            { _id: channel._id, "tgSources.url": source.url },
                                            { $set: { "tgSources.$.lastMessageId": post.maxId } }
                                        );

                                        // Оновлюємо статистику постів
                                        await User.findByIdAndUpdate(user._id, { $inc: { 'dailyPostStats.count': 1 } });
                                        user.dailyPostStats.count++;
                                    }
                                } finally {
                                    // Очищення тимчасових файлів альбому
                                    for (const tmpPath of tmpFiles) {
                                        fs.unlink(tmpPath, () => { });
                                    }
                                }

                            } else {
                                // --- ОБРОБКА ОДИНОЧНОГО ПОСТА ---
                                let rewrittenText = "";
                                if (post.text) {
                                    rewrittenText = await rewriteNews("", post.text, channel.aiPrompt || null);
                                }

                                const caption = rewrittenText?.substring(0, 1024) || "";
                                const options = { caption, parse_mode: 'HTML' };
                                let tmpPath = null;

                                try {
                                    if (post.media && post.mediaType) {
                                        tmpPath = await bufferToTempFile(post.media, post.mediaType);
                                        const stream = fs.createReadStream(tmpPath);
                                        const fileOptions = {
                                            filename: post.mediaType === 'photo' ? 'image.jpg' : 'video.mp4',
                                            contentType: post.mediaType === 'photo' ? 'image/jpeg' : 'video/mp4',
                                        };

                                        if (post.mediaType === 'photo') {
                                            await bot.sendPhoto(targetId, stream, options, fileOptions);
                                        } else if (post.mediaType === 'video') {
                                            await bot.sendVideo(targetId, stream, options, fileOptions);
                                        } else {
                                            await bot.sendDocument(targetId, stream, options, fileOptions);
                                        }
                                    } else if (caption) {
                                        await bot.sendMessage(targetId, caption, { parse_mode: 'HTML' });
                                    }

                                    // Оновлюємо базу
                                    await Channel.updateOne(
                                        { _id: channel._id, "tgSources.url": source.url },
                                        { $set: { "tgSources.$.lastMessageId": post.id } }
                                    );

                                    await User.findByIdAndUpdate(user._id, { $inc: { 'dailyPostStats.count': 1 } });
                                    user.dailyPostStats.count++;

                                    console.log(`✅ Пост ID ${post.id} репостнуто.`);
                                } finally {
                                    // Очищення тимчасового файлу
                                    if (tmpPath) fs.unlink(tmpPath, () => { });
                                }
                            }
                        } catch (err) {
                            console.error(`❌ Помилка на пості:`, err.message);
                            // У разі помилки API (наприклад, файл занадто великий), пропускаємо цей ID
                            const skipId = post.isGroup ? post.maxId : post.id;
                            await Channel.updateOne(
                                { _id: channel._id, "tgSources.url": source.url },
                                { $set: { "tgSources.$.lastMessageId": skipId } }
                            );
                        }
                    }
                }
            }
        }
    } catch (error) {

        console.error("❌ Глобальна помилка processNews:", error.message);
    } finally {
        isProcessing = false;
    }
};

module.exports = { processNews, processSingleChannel };