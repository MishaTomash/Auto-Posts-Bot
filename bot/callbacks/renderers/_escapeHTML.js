// bot/callbacks/renderers/_escapeHTML.js
// Спільна утиліта екранування HTML для всіх render-модулів.

const escapeHTML = (str) => {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

module.exports = { escapeHTML };