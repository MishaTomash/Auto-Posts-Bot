const axios = require('axios');
const crypto = require('crypto');

/**
 * Валідація: перевірка, чи є посилання справжнім JSON-джерелом
 */
const validateJSON = async (url) => {
    try {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
            return false;
        }

        const response = await axios.get(url, { 
            timeout: 10000, 
            headers: { 
                'Accept': 'application/json, text/plain, */*',
                // ✅ Багато урядових сайтів блокують без цього заголовку
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            } 
        });
        
        return typeof response.data === 'object' && response.data !== null;
    } catch (e) {
        console.log(`validateJSON помилка для ${url}:`, e.message);
        return false;
    }
};

const fetchRawJson = async (url) => {
    try {
        const response = await axios.get(url, { 
            timeout: 15000,
            headers: { 'Accept': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error(`❌ Помилка JSON [${url}]:`, error.message);
        return null;
    }
};

const getHash = (data) => {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHash('md5').update(str).digest('hex');
};

// НЕ ЗАБУДЬ ДОДАТИ validateJSON В ЕКСПОРТ
module.exports = { fetchRawJson, getHash, validateJSON };