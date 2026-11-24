import "dotenv/config";
import { randomBytes } from "node:crypto";
import { run, startWebhook } from "node-telegram-bot-api/node";
import { COMMANDS, createBot } from "./bot";
import { prisma } from "./db";

// Long-running entry point: local development (long polling) or a
// self-hosted webhook server. In production the bot runs as the Neon
// Function in functions/telegram.ts, which shares the handlers in ./bot.

console.log("Starting popupki app");

const { BOT_TOKEN, PORT, HOST, WEBHOOK_SECRET } = process.env;

if (BOT_TOKEN === undefined) {
  throw new Error("BOT_TOKEN is not defined");
}

const bot = createBot(BOT_TOKEN);

process.on("unhandledRejection", (err) => {
  console.error(err);
});

const main = async () => {
  await bot.api.setMyCommands({ commands: COMMANDS });

  if (PORT && HOST) {
    const path = "/telegram";
    const secretToken = WEBHOOK_SECRET ?? randomBytes(32).toString("hex");
    await bot.api.setWebhook({ url: `${HOST}${path}`, secret_token: secretToken });
    console.log(`Webhook mode: listening on :${PORT}${path}`);
    await startWebhook(bot, { port: Number(PORT), path, secretToken });
  } else {
    await bot.api.deleteWebhook({});
    console.log("Polling mode");
    await run(bot);
  }
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
