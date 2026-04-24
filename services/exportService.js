const User = require('../models/User');

const exportUsersToCSV = async () => {
    const users = await User.find().lean();
    let csv = '\uFEFF'; // BOM для Excel (щоб кирилиця відображалася правильно)
    csv += 'ID;Username;Plan;JoinedAt;Status\n';

    users.forEach(u => {
        csv += `${u.telegramId};${u.username || 'N/A'};${u.subscription?.plan || 'free'};${u.createdAt.toISOString()};${u.isBlocked ? 'Blocked' : 'Active'}\n`;
    });

    return Buffer.from(csv, 'utf-8');
};

module.exports = { exportUsersToCSV };