const mongoose = require('mongoose');
// models/Channel.js
const channelSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    channelId: { type: String },
    channelUsername: { type: String },
    rssUrls: { type: [String], default: [] },
    
    // ДОДАЙТЕ ЦЕ ПОЛЕ:
    tgSources: [{
        url: { type: String, required: true },
        lastMessageId: { type: Number, default: 0 }
    }],

    jsonSources: [{
        url: { type: String, required: true },
        label: { type: String, default: 'JSON Data' },
        lastDataHash: { type: String }
    }],
    isActive: { type: Boolean, default: true },
    isEnabled: { type: Boolean, default: false },
    checkInterval: { type: Number, default: 15 },
    lastCheckAt: { type: Date, default: new Date(0) },
    aiPrompt: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Channel', channelSchema)