import "dotenv/config";
import { Bot } from "node-telegram-bot-api";
import { COMMANDS } from "../src/bot";

// Point Telegram at a webhook URL (the Neon Function's invocation_url):
//   npx tsx scripts/set-webhook.ts https://<branch-id>-telegram.<suffix>
// Uses BOT_TOKEN and WEBHOOK_SECRET from .env, the same values neon.ts deploys.

const url = process.argv[2];
const { BOT_TOKEN, WEBHOOK_SECRET } = process.env;
if (!url || !BOT_TOKEN || !WEBHOOK_SECRET) {
  throw new Error("usage: set-webhook.ts <url>; needs BOT_TOKEN and WEBHOOK_SECRET in .env");
}

const bot = new Bot(BOT_TOKEN);
(async () => {
  await bot.api.setMyCommands({ commands: COMMANDS });
  await bot.api.setWebhook({
    url,
    secret_token: WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
  });
  const info = await bot.api.getWebhookInfo();
  console.log({ url: info.url, pending: info.pending_update_count, last_error: info.last_error_message });
})();
