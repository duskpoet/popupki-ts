import "dotenv/config";
import { randomBytes } from "node:crypto";
import Channel from "@nodeguy/channel";
import { Bot } from "node-telegram-bot-api";
import { run, startWebhook } from "node-telegram-bot-api/node";
import { prisma } from "./db";
import {
  BreakError,
  Dialog,
  ExtendedMessage,
  goDialog,
  SendMessagePayload,
} from "./dialog";

console.log("Starting popupki app");

const { BOT_TOKEN, PORT, HOST, WEBHOOK_SECRET } = process.env;

if (BOT_TOKEN === undefined) {
  throw new Error("BOT_TOKEN is not defined");
}

const bot = new Bot(BOT_TOKEN);

const dialogs = new Map<number, Dialog>();

const globalQueue = new Channel<ExtendedMessage>();

bot.on("message", (ctx) => {
  if (ctx.message) {
    globalQueue.push(ctx.message);
  }
});

bot.on("callback_query", async (ctx) => {
  if (ctx.callbackQuery) {
    globalQueue.push(ctx.callbackQuery);
  }
  // Stop the client-side spinner; a stale query is not worth failing over.
  await ctx.answerCallbackQuery().catch(() => undefined);
});

bot.catch((err, ctx) => {
  console.error(`update ${ctx.update.update_id} failed`, err);
});

const chatIdOf = (message: ExtendedMessage): number | undefined => {
  if ("message" in message && message.message) {
    return message.message.chat.id;
  }
  if ("chat" in message && message.chat) {
    return message.chat.id;
  }
  return undefined;
};

const newDialog = (chatId: number): Dialog => {
  const inChannel = new Channel<ExtendedMessage>();
  const outChannel = new Channel<SendMessagePayload>();
  const dialog: Dialog = { in: inChannel, out: outChannel };
  dialogs.set(chatId, dialog);
  (async () => {
    while (true) {
      const message = await outChannel.shift();
      if (message === undefined) {
        return;
      }
      try {
        await bot.api.sendMessage({
          chat_id: chatId,
          text: message.text,
          ...message.options,
        });
      } catch (e) {
        console.error(e);
      }
    }
  })();
  (async () => {
    try {
      await goDialog(chatId, inChannel, outChannel);
    } catch (e) {
      if (e instanceof BreakError) {
        globalQueue.push(e.data);
      } else {
        console.error(e);
      }
    } finally {
      inChannel.close();
      outChannel.close();
      dialogs.delete(chatId);
    }
  })();

  return dialog;
};

(async () => {
  while (true) {
    try {
      const message = await globalQueue.shift();
      if (message === undefined) {
        return;
      }
      const chatId = chatIdOf(message);
      if (chatId === undefined) {
        continue;
      }
      const dialog = dialogs.get(chatId) || newDialog(chatId);
      dialog.in.push(message);
    } catch (e) {
      console.error(e);
    }
  }
})();

process.on("unhandledRejection", (err) => {
  console.error(err);
});

const main = async () => {
  await bot.api.setMyCommands({
    commands: [
      { command: "help", description: "Help" },
      { command: "popupki", description: "Popupki" },
      { command: "clear", description: "Clear" },
    ],
  });

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
