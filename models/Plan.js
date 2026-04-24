const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // Наприклад: 'pro'
    displayName: { type: String, required: true },       // Наприклад: 'Pro Plan'
    price: { type: Number, default: 0 },                 // Ціна в Stars/грн
    maxChannels: { type: Number, default: 1 },
    maxPostsPerDay: { type: Number, default: 5 },
    hasCustomPrompt: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Plan', planSchema);