const Plan = require('../models/Plan');

const initDefaultPlans = async () => {
    const defaultPlans = [
        { 
            name: 'free', 
            displayName: 'FREE', 
            price: 0, 
            maxChannels: 1, 
            maxPostsPerDay: 5, 
            hasCustomPrompt: false 
        },
        { 
            name: 'basic', 
            displayName: 'BASIC', 
            price: 50, 
            maxChannels: 3, 
            maxPostsPerDay: 30, 
            hasCustomPrompt: true 
        },
        { 
            name: 'pro', 
            displayName: 'PRO', 
            price: 150, 
            maxChannels: 10, 
            maxPostsPerDay: 100, 
            hasCustomPrompt: true 
        },
        { 
            name: 'business', 
            displayName: 'BUSINESS', 
            price: 500, // Це початкове значення, якщо в БД ще порожньо
            maxChannels: 50, 
            maxPostsPerDay: 1000, 
            hasCustomPrompt: true 
        }
    ];

    for (const plan of defaultPlans) {
        await Plan.findOneAndUpdate(
            { name: plan.name },
            // ВИПРАВЛЕНО: $setOnInsert замість $set
            { $setOnInsert: plan }, 
            { upsert: true, returnDocument: 'after' }
        );
    }
    console.log('✅ Структуру тарифів у БД перевірено (дані адмінки захищено)');
};

module.exports = { initDefaultPlans };