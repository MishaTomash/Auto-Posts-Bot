// bot/callbacks/ui_renderers.js
//
// Фасадний файл (barrel export). Уся логіка рендерингу розкладена за доменом
// у ./renderers/*. Цей файл залишений як єдина точка входу, бо багато інших
// модулів проєкту імпортують саме його: admin_modules/*, channel_modules/*,
// bot/handlers/text_states/*, profile.js, wizard.js тощо. Видаляти або
// перейменовувати його НЕ можна без оновлення всіх цих require().
//
// РЕФАКТОРИНГ оригінального файлу (337 рядків, 8 функцій в одному файлі):
// розкладено на ./renderers/promptRenderer.js, planRenderer.js,
// sourcesRenderer.js, profileRenderer.js, channelSettingsRenderer.js,
// adminDashboardRenderer.js, _escapeHTML.js.
//
// Дрібне виправлення: у оригінальному renderChannelSettings був зайвий
// require('../keyboards/channel') усередині функції, хоча та сама
// getChannelSettingsKeyboard уже імпортувалась вгорі файлу. Прибрано —
// тепер єдиний імпорт у channelSettingsRenderer.js.

const { escapeHTML } = require('./renderers/_escapeHTML');
const { renderPromptSettings } = require('./renderers/promptRenderer');
const { renderPlanEditCard, renderSubscriptionShop } = require('./renderers/planRenderer');
const { renderSourcesList } = require('./renderers/sourcesRenderer');
const { renderProfile } = require('./renderers/profileRenderer');
const { renderChannelSettings } = require('./renderers/channelSettingsRenderer');
const { renderAdminDashboard } = require('./renderers/adminDashboardRenderer');

module.exports = {
    renderAdminDashboard,
    renderChannelSettings,
    escapeHTML,
    renderPromptSettings,
    renderPlanEditCard,
    renderSubscriptionShop,
    renderSourcesList,
    renderProfile
};