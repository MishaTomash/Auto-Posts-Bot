const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    telegramId:  String,
    plan:        String,
    amount:      Number,   // Ціна в гривнях
    paymentCode: { type: String, unique: true }, // Унікальний код P-XXXX-XX
    status: {
        type:    String,
        enum:    ['pending', 'waiting_confirmation', 'confirmed', 'rejected'],
        default: 'pending'
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', PaymentSchema);