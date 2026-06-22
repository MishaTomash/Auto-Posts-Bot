const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input"); // бібліотека для вводу в консолі

// Заміни на свої дані!
const apiId = 31265655
; // твій API_ID (цифри)
const apiHash = "70b79f8d3f06311513fa41e7258564c8"; // твій API_HASH (рядок)

// Створюємо порожню сесію
const stringSession = new StringSession(""); 

(async () => {
  console.log("Запуск авторизації...");
  
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text("Введи свій номер телефону (наприклад, +380...): "),
    password: async () => await input.text("Введи хмарний пароль (якщо стоїть 2FA, якщо ні - просто Enter): "),
    phoneCode: async () => await input.text("Введи код підтвердження з Telegram: "),
    onError: (err) => console.log(err),
  });

  console.log("✅ Успішна авторизація!");
  console.log("👇 ОСЬ ТВІЙ НОВИЙ STRING SESSION 👇\n");
  console.log(client.session.save()); // Це виведе довгий рядок
  console.log("\n☝️ Скопіюй цей рядок і додай у свій файл .env");
  
  await client.disconnect();
})();