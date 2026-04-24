const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
        // 1. Перетворюємо заголовки HTML на жирний текст
        .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '<b>$1</b>')
        
        // 2. Дозволяємо ТІЛЬКИ теги: b, i, code, pre, a
        // Видаляємо всі інші HTML теги
        .replace(/<(?!\/?(?:b|i|code|pre|a)(?:\s[^>]*)?>)[^>]+>/gi, '')
        
        // 3. Замінюємо 3 і більше переносів рядка на 2
        .replace(/\n{3,}/g, '\n\n')
        
        // 4. Видаляємо зайві пробіли на початку та в кінці
        .trim();
};

const rewriteNews = async (title, content, customPrompt = null) => {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
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