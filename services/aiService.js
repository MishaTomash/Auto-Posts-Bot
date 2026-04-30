// services/aiService.js
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Твій новий структурований стандарт
const DEFAULT_PROMPT = `Ти — досвідчений редактор Telegram-каналу.
Створи красивий пост з новини. СТРУКТУРА ПОСТУ (строго дотримуйся):
1. Перший рядок — емодзі + короткий цепляючий ЗАГОЛОВОК у тегах <b></b>
2. Порожній рядок
3. Основний текст 2-3 речення — коротко, зрозуміло, інтригуючи
4. Порожній рядок
5. Рядок з тегами/хештегами (1-3 штуки, наприклад: #технології #AI #новини)`;

const sanitizeForTelegram = (text) => {
    if (!text) return '';
    return text
        .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '<b>$1</b>')
        .replace(/<(?!\/?(?:b|i|code|pre|a)(?:\s[^>]*)?>)[^>]+>/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const rewriteNews = async (title, content, customPrompt = null) => {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                // Якщо customPrompt порожній (null), беремо DEFAULT_PROMPT
                { role: "system", content: customPrompt || DEFAULT_PROMPT },
                { role: "user", content: `Заголовок: ${title}\nТекст: ${content}` }
            ],
            max_tokens: 400,
            temperature: 0.8,
        });
        return sanitizeForTelegram(response.choices[0].message.content);
    } catch (error) {
        console.error("❌ Помилка OpenAI:", error.message);
        return null;
    }
};
const checkIsAdvertisement = async (text) => {
    if (!text || text.trim().length < 10) return false;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `Ти — фільтр рекламного контенту для новинного агрегатора.

Визнач, чи є текст РЕКЛАМОЮ.

Реклама — це:
- Пряма пропозиція купити товар/послугу
- Заклик підписатися на платний сервіс або канал за винагороду
- Промокоди, знижки, розпродажі
- Партнерські/реферальні посилання
- Фрази: "купи зараз", "тільки сьогодні", "замов", "переходь за посиланням"
- Прихована реклама (нативна): "я користуюсь цим продуктом і рекомендую"

НЕ реклама:
- Новини про компанії, навіть якщо згадуються продукти
- Аналітика ринку
- Редакційні огляди без CTA
- Анонси безкоштовних подій

Відповідай ТІЛЬКИ JSON без зайвого тексту:
{"isAd": true/false, "confidence": 0.0-1.0, "reason": "коротко чому"}`
                },
                {
                    role: "user",
                    content: text.substring(0, 1000) // обрізаємо довгі тексти
                }
            ],
            temperature: 0,
            response_format: { type: "json_object" },
        });

        const result = JSON.parse(response.choices[0].message.content);

        console.log(`🔍 Ad check: isAd=${result.isAd}, confidence=${result.confidence}, reason="${result.reason}"`);

        // Блокуємо тільки якщо модель впевнена (>= 0.75)
        return result.isAd === true && result.confidence >= 0.75;

    } catch (error) {
        console.error("❌ Помилка AI фільтра реклами:", error.message);
        return false;
    }
};

module.exports = { rewriteNews, sanitizeForTelegram, DEFAULT_PROMPT, checkIsAdvertisement };