// models/ScheduledPost.js
const mongoose = require('mongoose');

const ScheduledPostSchema = new mongoose.Schema({
    channelId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
    telegramChannelId: { type: String, required: true },   // напр. @my_channel або -100...
    userId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // ─── Контент ────────────────────────────────────────────────────────────
    text:        { type: String, default: null },
    mediaFileId: { type: String, default: null },  // Telegram file_id (фото/відео)
    mediaType:   { type: String, default: null },  // 'photo' | 'video' | null

    // ─── Час ────────────────────────────────────────────────────────────────
    scheduledAt: { type: Date, required: true },

    // ─── Пін-пріоритет (блокує авто-пости поки не мине) ─────────────────────
    pinDurationMin: { type: Number, default: 0 },  // 0 = без пріоритету

    // ─── Авто-видалення ──────────────────────────────────────────────────────
    deleteAfterMin: { type: Number, default: 0 },  // 0 = не видаляти
    deleteAt:       { type: Date,   default: null }, // заповнюється при публікації

    // ─── Статус ──────────────────────────────────────────────────────────────
    status: {
        type:    String,
        enum:    ['pending', 'published', 'failed', 'cancelled'],
        default: 'pending'
    },
    publishedMessageId: { type: Number, default: null }, // для авто-видалення
    isDeleted:          { type: Boolean, default: false },

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ScheduledPost', ScheduledPostSchema);