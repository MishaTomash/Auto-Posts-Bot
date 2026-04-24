// models/Channel.js
const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    channelId: { type: String },
    channelUsername: { type: String },
    rssUrls: { type: [String], default: [] },
    jsonSources: [{
        url: { type: String, required: true },
        label: { type: String, default: 'JSON Data' },
        lastDataHash: { type: String }
    }],
    isActive: { type: Boolean, default: true },
    isEnabled: { type: Boolean, default: false },
    checkInterval: { type: Number, default: 15 },
    lastCheckAt: { type: Date, default: new Date(0) },
    aiPrompt: {
        type: String,
        default: "Зроби цікавий рерайт цієї новини для Telegram каналу. Використовуй емодзі та короткі речення."
    }
}, { timestamps: true });

module.exports = mongoose.model('Channel', channelSchema);