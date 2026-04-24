const https = require('https');

// Безкоштовний API Unsplash — реєстрація на unsplash.com/developers
// Або використовуємо публічний endpoint без ключа (обмежено)
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || null;

/**
 * Шукаємо фото на Unsplash за ключовими словами
 */
const getUnsplashImage = (query) => {
    return new Promise((resolve) => {
        if (!UNSPLASH_ACCESS_KEY) {
            resolve(null);
            return;
        }

        const encodedQuery = encodeURIComponent(query);
        const url = `https://api.unsplash.com/photos/random?query=${encodedQuery}&orientation=landscape&client_id=${UNSPLASH_ACCESS_KEY}`;

        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.urls?.regular || null);
                } catch {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
};

/**
 * Перевіряємо чи доступне фото за URL
 */
const isImageAccessible = (url) => {
    return new Promise((resolve) => {
        try {
            const urlObj = new URL(url);
            const lib = urlObj.protocol === 'https:' ? https : require('http');
            
            const req = lib.request({ 
                method: 'HEAD', 
                hostname: urlObj.hostname, 
                path: urlObj.pathname + urlObj.search,
                timeout: 5000
            }, (res) => {
                resolve(res.statusCode >= 200 && res.statusCode < 400);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.end();
        } catch {
            resolve(false);
        }
    });
};

/**
 * Головна функція: спочатку RSS фото, потім Unsplash, потім null
 */
const getImageForPost = async (rssImageUrl, searchQuery) => {
    // 1. Пробуємо фото з RSS
    if (rssImageUrl) {
        const accessible = await isImageAccessible(rssImageUrl);
        if (accessible) return rssImageUrl;
    }

    // 2. Пробуємо Unsplash
    const unsplashUrl = await getUnsplashImage(searchQuery);
    if (unsplashUrl) return unsplashUrl;

    // 3. Нічого не знайшли — відправимо без фото
    return null;
};

module.exports = { getImageForPost };