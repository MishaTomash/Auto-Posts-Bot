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

module.exports = { rewriteNews, sanitizeForTelegram, DEFAULT_PROMPT };