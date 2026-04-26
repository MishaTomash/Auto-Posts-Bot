const https = require('https');

// Безкоштовний API Unsplash — реєстрація на unsplash.com/developers
// Або використовуємо публічний endpoint без ключа (обмежено)
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || null;

/**
 * Шукаємо фото на Unsplash, якщо оригінального медіа немає
 * Використовується як фолбек для текстових постів
 */
const getUnsplashImage = (query) => {
    return new Promise((resolve) => {
        if (!UNSPLASH_ACCESS_KEY || !query) {
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
                    // Повертаємо URL картинки
                    resolve(json.urls?.regular || null);
                } catch {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
};

module.exports = { getUnsplashImage };