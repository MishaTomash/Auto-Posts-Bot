// scripts/seedPlans.js
require('dotenv').config();
const mongoose = require('mongoose');
const Plan = require('../models/Plan'); // Перевір шлях до моделі

const defaultPlans = [
    {
        name: 'free',
        price: 0,
        maxChannels: 1,
        maxPostsPerDay: 5,
        customPromptAllowed: false
    },
    {
        name: 'basic',
        price: 50,
        maxChannels: 3,
        maxPostsPerDay: 30,
        customPromptAllowed: true
    },
    {
        name: 'pro',
        price: 150,
        maxChannels: 10,
        maxPostsPerDay: 100,
        customPromptAllowed: true
    },
    {
        name: 'business',
        price: 500,
        maxChannels: 50,
        maxPostsPerDay: 1000,
        customPromptAllowed: true
    }
];

const seedDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Підключено до бази для ініціалізації тарифів...");

        // Видаляємо старі, якщо вони були (опціонально)
        // await Plan.deleteMany({}); 

        for (const planData of defaultPlans) {
            // Використовуємо upsert, щоб не дублювати тарифи при повторному запуску
            await Plan.findOneAndUpdate(
                { name: planData.name },
                planData,
                { upsert: true, new: true }
            );
            console.log(`📦 Тариф [${planData.name.toUpperCase()}] створено/оновлено`);
        }

        console.log("🚀 Всі тарифи успішно додані в базу!");
        process.exit();
    } catch (err) {
        console.error("❌ Помилка ініціалізації:", err);
        process.exit(1);
    }
};

seedDB();