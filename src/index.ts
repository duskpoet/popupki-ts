import "dotenv/config";
import Channel from "@nodeguy/channel";

import * as TelegramBot from "node-telegram-bot-api";
import { Dialog, goDialog, SendMessagePayload } from "./dialog";

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
]);

const dialogs = new Map<number, Dialog>();

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
    await goDialog(chatId, inChannel, outChannel);
    inChannel.close();
    outChannel.close();
    dialogs.delete(chatId);
  })();

  return { in: inChannel, out: outChannel };
};

bot.on("message", (message) => {
  try {
    console.log("Got message", message);
    const chatId = message.chat.id;
    const dialog = dialogs.get(chatId) || newDialog(chatId);
    dialog.in.push(message);
  } catch (e) {
    console.error(e);
  }
});

bot.on("callback_query", (query) => {
  try {
    console.log("Got callback", query);
    const chatId = query.message?.chat.id;
    if (!chatId) {
      return;
    }
    const dialog = dialogs.get(chatId);
    if (!dialog) {
      return;
    }
    dialog.in.push(query);
  } catch (e) {
    console.error(e);
  }
});
