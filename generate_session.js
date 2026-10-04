// Одноразовий скрипт: логіниться в Telegram-акаунт і друкує StringSession для .env.
// Запуск: node generate_session.js  (TELEGRAM_API_ID і TELEGRAM_API_HASH беруться з .env)
require("dotenv").config();
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

if (!apiId || !apiHash) {
  console.error(
    "Додай TELEGRAM_API_ID і TELEGRAM_API_HASH у .env (взяти на https://my.telegram.org)",
  );
  process.exit(1);
}

(async () => {
  console.log("Запуск авторизації...");

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
    useWSS: true,
  });

  await client.start({
    phoneNumber: async () => await input.text("Номер телефону (+380...): "),
    password: async () =>
      await input.text("Хмарний пароль (якщо немає 2FA — Enter): "),
    phoneCode: async () => await input.text("Код підтвердження з Telegram: "),
    onError: (err) => console.error(err),
  });

  console.log(
    "\n✅ Авторизація успішна. Рядок нижче — це ПОВНИЙ доступ до акаунта.",
  );
  console.log(
    "Встав його в .env як TELEGRAM_SESSION і нікуди більше не копіюй:\n",
  );
  console.log(client.session.save());

  await client.disconnect();
})();
