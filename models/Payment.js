const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    telegramId: String,
    plan: String,
    amount: Number, // Ціна в Stars
    payload: String,
    chargeId: String, // Telegram Payment Charge ID (Є1)
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', PaymentSchema);