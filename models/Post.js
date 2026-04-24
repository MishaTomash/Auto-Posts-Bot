const mongoose = require('mongoose');
// models/Post.js
const PostSchema = new mongoose.Schema({
    channelId: { type: String, required: true }, // ЗМІНИ НА STRING
    originalLink: { type: String, required: true }, // Переконайся, що це поле є
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    aiText: String,
    createdAt: { type: Date, default: Date.now }
});
PostSchema.index({ channelId: 1, originalLink: 1 }, { unique: true });
module.exports = mongoose.model('Post', PostSchema);