const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    username: String,
    role: { type: String, default: 'user' }, // admin / user

    subscription: {
        plan: { type: String, default: 'free' },
        expiresAt: { type: Date, default: null }, // Дата закінчення підписки
        expiryReminderSent: { type: Boolean, default: false }, // Нагадування за 3 дні
        maxChannels: { type: Number, default: 1 },
        maxPostsPerDay: { type: Number, default: 5 },
        canCustomPrompt: { type: Boolean, default: false }
    },

    dailyPostStats: {
        date: { type: String }, // Формат YYYY-MM-DD
        count: { type: Number, default: 0 }
    },

    tempState: { type: String, default: null },
    tempData: { type: Object, default: {} },
    lastMenuMessageId: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now },
    lastActiveAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', UserSchema);