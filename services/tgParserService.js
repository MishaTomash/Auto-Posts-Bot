const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram");
const input = require("input");

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const stringSession = new StringSession(process.env.TELEGRAM_SESSION || "");

const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
});

async function initTgClient() {
    if (!process.env.TELEGRAM_SESSION) {
        await client.start({
            phoneNumber: async () => await input.text("Введіть номер телефону: "),
            password: async () => await input.text("Введіть пароль (якщо є 2FA): "),
            phoneCode: async () => await input.text("Введіть код з Telegram: "),
            onError: (err) => console.log(err),
        });
        console.log("✅ Сесія створена:", client.session.save());
        console.log("👉 СКОПІЮЙ ЦЕЙ РЯДОК У TELEGRAM_SESSION В .env ФАЙЛ!");
    } else {
        await client.connect();
    }
}

function getMediaType(msg) {
    if (!msg.media) return null;
    if (msg.media instanceof Api.MessageMediaPhoto) return 'photo';
    if (msg.media instanceof Api.MessageMediaDocument) {
        const doc = msg.media.document;
        const mime = doc?.mimeType || '';
        if (mime.startsWith('video/')) return 'video';
        if (mime.startsWith('audio/')) return 'audio';
        return 'document';
    }
    return null;
}

async function getLatestPosts(channelUrl, lastId) {
    try {
        const entity = await client.getEntity(channelUrl);
        const messages = await client.getMessages(entity, { limit: 15 });

        // ЯКЩО ЦЕ ПЕРШИЙ ЗАПУСК (lastId === 0)
        if (!lastId || lastId === 0) {
            const maxMsgId = messages.length > 0 ? Math.max(...messages.map(m => m.id)) : 0;
            console.log(`🆕 [INIT] Перша перевірка ${channelUrl}. Фіксуємо ID: ${maxMsgId}`);
            
            // Повертаємо спеціальний об'єкт, щоб зафіксувати точку відліку
            return [{ isInitial: true, maxId: maxMsgId }];
        }

        const newMessages = messages
            .filter(msg => msg.id > lastId && !msg.action)
            .sort((a, b) => a.id - b.id);

        const grouped = {};

        for (const msg of newMessages) {
            const mediaType = getMediaType(msg);

            // Завантажуємо медіа як Buffer тільки якщо воно є
            let mediaBuffer = null;
            if (msg.media && mediaType) {
                mediaBuffer = await client.downloadMedia(msg.media, {});
            }

            const postData = {
                id: msg.id,
                text: msg.message || "",
                media: mediaBuffer,       // Buffer або null
                mediaType: mediaType,     // 'photo' | 'video' | 'audio' | 'document' | null
            };

            if (msg.groupedId) {
                const gid = msg.groupedId.toString();
                if (!grouped[gid]) {
                    grouped[gid] = { isGroup: true, items: [], maxId: msg.id };
                }
                grouped[gid].items.push(postData);
                grouped[gid].maxId = Math.max(grouped[gid].maxId, msg.id);
            } else {
                grouped[`single_${msg.id}`] = { isGroup: false, ...postData };
            }
        }

        return Object.values(grouped);
    } catch (error) {
        console.error("Парсинг помилка:", error.message);
        return [];
    }
}

module.exports = { initTgClient, getLatestPosts };