const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
    type: { type: String, enum: ['ERROR', 'ADMIN_ACTION'], required: true },
    level: { type: String, default: 'info' }, // info, warn, error
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Хто зробив дію
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },  // На кого вплинула дія
    action: String,      // Назва дії: "CHANGE_PLAN", "BLOCK_USER"
    details: String,     // Опис або текст помилки
    metadata: Object,    // Додаткові дані (стек помилки, старі/нові значення)
    createdAt: { type: Date, default: Date.now, expires: '30d' } // Автовидалення через 30 днів
});

module.exports = mongoose.model('Log', logSchema);