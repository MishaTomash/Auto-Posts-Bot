const Parser = require('rss-parser');

const parser = new Parser({
    customFields: {
        item: [
            ['media:content', 'mediaContent', { keepArray: false }],
            ['media:thumbnail', 'mediaThumbnail', { keepArray: false }],
            ['enclosure', 'enclosure'],
        ]
    },
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    requestOptions: { rejectUnauthorized: false }
});

// Витягуємо URL фото з різних полів RSS
const extractImageUrl = (item) => {
    // 1. media:content
    if (item.mediaContent?.$.url) return item.mediaContent.$.url;
    // 2. media:thumbnail
    if (item.mediaThumbnail?.$.url) return item.mediaThumbnail.$.url;
    // 3. enclosure (для подкастів/медіа)
    if (item.enclosure?.url && item.enclosure?.type?.startsWith('image')) return item.enclosure.url;
    // 4. Шукаємо <img> в HTML контенті
    const imgMatch = (item['content:encoded'] || item.content || '').match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) return imgMatch[1];
    return null;
};

const fetchNews = async (rssUrl) => {
    try {
        const feed = await parser.parseURL(rssUrl);
        if (!feed || !feed.items) return [];

        return feed.items.map(item => ({
            title: item.title ? item.title.trim() : "Без заголовка",
            link: item.link,
            content: (item.contentSnippet || item.content || item.description || '')
                .replace(/<[^>]*>?/gm, '').trim(),
            pubDate: item.pubDate,
            imageUrl: extractImageUrl(item) // ← нове поле
        }));
    } catch (error) {
        console.error(`❌ Помилка RSS [${rssUrl}]:`, error.message);
        return [];
    }
};

const validateRSS = async (url) => {
    try {
        const feed = await parser.parseURL(url);
        return !!(feed && feed.title);
    } catch (e) {
        return false;
    }
};

module.exports = { fetchNews, validateRSS };