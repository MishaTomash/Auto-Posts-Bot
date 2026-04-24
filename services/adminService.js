const User = require('../models/User');
const Channel = require('../models/Channel');
const Post = require('../models/Post');
const Payment = require('../models/Payment');
const Plan = require('../models/Plan');
const { getAdminDashboardKeyboard } = require('../bot/keyboards/admin');
// services/adminService.js
const PLAN_LIMITS = {
    free: { maxChannels: 1, maxPostsPerDay: 5, customPromptAllowed: false },
    basic: { maxChannels: 3, maxPostsPerDay: 30, customPromptAllowed: true },
    pro: { maxChannels: 10, maxPostsPerDay: 100, customPromptAllowed: true },
    business: { maxChannels: 100, maxPostsPerDay: 1000, customPromptAllowed: true }
};

const getAdminStats = async () => {
    try {
        const now = new Date();
        // Створюємо копії, щоб не мутувати основну дату
        const startOfDay = new Date(new Date(now).setHours(0, 0, 0, 0));
        const startOfWeek = new Date(new Date(now).setDate(now.getDate() - 7));
        const startOfMonth = new Date(new Date(now).setMonth(now.getMonth() - 1));

        const [
            totalUsers, newToday, activeLastWeek,
            plans, channels, posts, revenue
        ] = await Promise.all([
            User.countDocuments().catch(() => 0),
            User.countDocuments({ createdAt: { $gte: startOfDay } }).catch(() => 0),
            User.countDocuments({ lastActiveAt: { $gte: startOfWeek } }).catch(() => 0),

            User.aggregate([
                { $group: { _id: "$subscription.plan", count: { $sum: 1 } } }
            ]).catch(() => []),

            Channel.aggregate([
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        active: { $sum: { $cond: ["$isActive", 1, 0] } }
                    }
                }
            ]).catch(() => []),

            Post.countDocuments({ createdAt: { $gte: startOfDay } }).catch(() => 0),

            Payment.aggregate([
                { $match: { createdAt: { $gte: startOfMonth }, status: 'completed' } }, // Додав фільтр статусу
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]).catch(() => [])
        ]);

        const planStats = { free: 0, basic: 0, pro: 0, business: 0 };
        if (Array.isArray(plans)) {
            plans.forEach(p => { 
                if (p._id && planStats.hasOwnProperty(p._id)) planStats[p._id] = p.count; 
            });
        }

        return {
            general: { totalUsers, newToday, activeLastWeek },
            plans: planStats,
            channels: (channels && channels[0]) ? channels[0] : { total: 0, active: 0 },
            postsToday: posts || 0,
            monthlyRevenue: (revenue && revenue[0]) ? revenue[0].total : 0
        };
    } catch (err) {
        console.error("Critical AdminStats Error:", err.message);
        return {
            general: { totalUsers: 0, newToday: 0, activeLastWeek: 0 },
            plans: { free: 0, basic: 0, pro: 0, business: 0 },
            channels: { total: 0, active: 0 },
            postsToday: 0,
            monthlyRevenue: 0
        };
    }
};

/**
 * Крок В1-В3: Отримання списку користувачів з пагінацією та фільтрами
 */
const getUsersList = async (page = 1, limit = 10, filters = {}) => {
    const skip = (page - 1) * limit;
    const query = {};

    if (filters.role) query.role = filters.role;
    if (filters.plan) query['subscription.plan'] = filters.plan;
    if (filters.status) query.isBlocked = filters.status === 'blocked';

    if (filters.search) {
        query.$or = [
            { telegramId: filters.search },
            { username: new RegExp(filters.search, 'i') }
        ];
    }

    // Оптимізований запит: тільки потрібні поля + lean()
    const users = await User.find(query)
        .select('username telegramId subscription.plan role isBlocked')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const total = await User.countDocuments(query);

    return {
        users,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalCount: total
    };
};

/**
 * Крок Г1-Г3: Отримання списку каналів
 */
const getChannelsList = async (page = 1, limit = 10, filters = {}) => {
    const skip = (page - 1) * limit;
    const query = {};

    if (filters.status) query.isActive = filters.status === 'active';
    if (filters.search) {
        query.$or = [
            { name: new RegExp(filters.search, 'i') },
            { channelId: filters.search }
        ];
    }
    if (filters.userId) query.userId = filters.userId;

    const channels = await Channel.find(query)
        .populate('userId', 'username telegramId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const total = await Channel.countDocuments(query);

    return {
        channels,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalCount: total
    };
};
const getAllPlans = async () => {
    return await Plan.find().sort({ price: 1 });
};

const updatePlan = async (planId, updateData) => {
    return await Plan.findByIdAndUpdate(planId, updateData, { new: true });
};

const createPlan = async (planData) => {
    return await Plan.create(planData);
};
const startBroadcast = async (bot, adminId, messageMsg) => {
    try {
        const users = await User.find({ role: { $ne: 'admin_hidden' } });
        let successCount = 0;
        let failCount = 0;

        const statusMsg = await bot.sendMessage(adminId, `⏳ Починаю розсилку на ${users.length} користувачів...`);

        for (const user of users) {
            try {
                // Копіюємо повідомлення (текст, фото, відео, кнопки — все збережеться)
                await bot.copyMessage(user.telegramId, adminId, messageMsg.message_id);
                successCount++;
            } catch (err) {
                failCount++;
            }
            // Ліміт Telegram: не більше 30 повідомлень на секунду
            if (successCount % 20 === 0) await new Promise(res => setTimeout(res, 500));
        }

        // --- ПОВЕРНЕННЯ ДО ДАШБОРДУ ---
        // Викликаємо функцію статистики (вона вже є у цьому ж файлі)
        const s = await getAdminStats();
        const updateTime = new Date().toLocaleTimeString('uk-UA');

        const text = `
✅ **Розсилку завершено!**
└ Доставлено: ${successCount}
└ Помилок: ${failCount}

----------------------------
📊 **ГОЛОВНИЙ ДАШБОРД** (Оновлено о ${updateTime})

👥 **Користувачі:**
└ Всього: ${s.general?.totalUsers || 0}
└ Нових (24г): ${s.general?.newToday || 0}

💎 **Дохід:** ${s.monthlyRevenue || 0} Stars

📺 **Канали:**
└ Всього: ${s.channels?.total || 0}
└ Активних: ${s.channels?.active || 0}
`;

        // Редагуємо повідомлення статусу на повноцінний дашборд
        return bot.editMessageText(text, {
            chat_id: adminId,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown',
            reply_markup: getAdminDashboardKeyboard() // Додаємо твої кнопки з Photo 2
        });

    } catch (error) {
        console.error("Broadcast Error:", error);
        await bot.sendMessage(adminId, "❌ Помилка під час розсилки. Спробуйте пізніше.");
    }
};
const getAdminPlansKeyboard = (plans) => {
    const buttons = plans.map(p => ([
        { text: `${p.name.toUpperCase()} (${p.price} Stars)`, callback_data: `admin_plan_view_${p._id}` }
    ]));

    buttons.push([{ text: '⬅️ Назад до адмінки', callback_data: 'admin_dashboard' }]);

    return { inline_keyboard: buttons };
};

// Меню конкретного тарифу
const getPlanEditKeyboard = (planId) => {
    return {
        inline_keyboard: [
            [{ text: '💰 Змінити ціну', callback_data: `admin_plan_set_price_${planId}` }],
            [{ text: '📺 Ліміт каналів', callback_data: `admin_plan_set_channels_${planId}` },
            { text: '📝 Ліміт постів', callback_data: `admin_plan_set_posts_${planId}` }],
            [{ text: '⬅️ До списку тарифів', callback_data: 'admin_plans' }]
        ]
    };
};
const updateUserPlanManually = async (userId, planName) => {
    try {
        const limits = PLAN_LIMITS[planName] || PLAN_LIMITS.free;

        // Встановлюємо дату закінчення на 30 днів від сьогодні (або інша логіка)
        const expiryDate = planName === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const updatedUser = await User.findByIdAndUpdate(userId, {
            'subscription.plan': planName,
            'subscription.expiresAt': expiryDate,
            'subscription.maxChannels': limits.maxChannels,
            'subscription.maxPostsPerDay': limits.maxPostsPerDay,
            'subscription.customPromptAllowed': limits.customPromptAllowed,
            'subscription.reminded': false
        }, { new: true });

        return updatedUser;
    } catch (error) {
        console.error('Error updating user plan:', error);
        throw error;
    }
};

module.exports = {
    updateUserPlanManually,
    getAdminDashboardKeyboard,
    getAdminPlansKeyboard,
    getPlanEditKeyboard,
    startBroadcast,
    getAdminStats,
    getUsersList,
    getChannelsList,
    getAllPlans,
    updatePlan,
    createPlan,
};