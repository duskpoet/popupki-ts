import "dotenv/config";
import Channel from "@nodeguy/channel";

console.log("Starting popupki app");

import * as TelegramBot from "node-telegram-bot-api";
import {
  BreakError,
  Dialog,
  ExtendedMessage,
  goDialog,
  SendMessagePayload,
} from "./dialog";

if (process.env.BOT_TOKEN === undefined) {
  throw new Error("BOT_TOKEN is not defined");
}

const { PORT, HOST } = process.env;

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: !PORT || !HOST,
  webHook: PORT && HOST ? { port: Number(PORT) } : undefined,
});

if (PORT && HOST) {
  bot.setWebHook(`${HOST}/bot${process.env.BOT_TOKEN}`);
}

bot.setMyCommands([
  { command: "/help", description: "Help" },
  { command: "/popupki", description: "Popupki" },
  { command: "/clear", description: "Clear" },
]);

const dialogs = new Map<number, Dialog>();

const globalQueue = new Channel<ExtendedMessage>();

bot.on("message", (message) => {
  console.log("message", message);
  globalQueue.push(message);
});

bot.on("callback_query", (query) => {
  console.log("callback_query", query);
  globalQueue.push(query);
});

const newDialog = (chatId: number): Dialog => {
  const inChannel = new Channel<TelegramBot.Message>();
  const outChannel = new Channel<SendMessagePayload>();
  dialogs.set(chatId, { in: inChannel, out: outChannel });
  (async () => {
    while (true) {
      const message = await outChannel.shift();
      if (message === undefined) {
        return;
      }
      bot.sendMessage(chatId, message.text, message.options);
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

  return { in: inChannel, out: outChannel };
};

(async () => {
  while (true) {
    try {
      const message = await globalQueue.shift();
      if (message === undefined) {
        return;
      }
      let chatId = 0;
      if ("message" in message && message.message) {
        chatId = message.message.chat.id;
      } else if ("chat" in message && message.chat) {
        chatId = message.chat.id;
      }

      const dialog = dialogs.get(chatId) || newDialog(chatId);
      dialog.in.push(message);
    } catch (e) {
      console.error(e);
    }
  }
})();

process.setUncaughtExceptionCaptureCallback((err) => {
  console.error(err);
});
process.on("unhandledRejection", (err) => {
  console.error(err);
});
process.on("SIGINT", () => {
  process.exit(0);
});
