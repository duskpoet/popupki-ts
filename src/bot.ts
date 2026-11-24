import { Bot } from "node-telegram-bot-api";
import type {
  InlineKeyboardMarkup,
  Message,
} from "node-telegram-bot-api";
import { prisma } from "./db";

/**
 * Every update is handled on its own: nothing is kept in memory between them,
 * so any process (a long-polling server or one of many Function instances)
 * can handle any update.
 *
 * The one multi-step flow, "➕ then type the names", carries its state in
 * Telegram itself: the bot sends ADD_PROMPT with `force_reply`, and the user's
 * answer arrives as a message whose `reply_to_message` is that prompt.
 */

const ADD_PROMPT = "Enter good(s) name";

const HELP_MESSAGE = `
 This is bot designed to help you with your shopping list.
 To start using it, add it to your group and type /popupki.
`;

export const COMMANDS = [
  { command: "help", description: "Help" },
  { command: "popupki", description: "Popupki" },
  { command: "clear", description: "Clear" },
];

const listKeyboard = async (chatId: number): Promise<InlineKeyboardMarkup> => {
  const popupki = await prisma.popupka.findMany({
    where: { chatId: String(chatId) },
    include: { Check: true },
    orderBy: { id: "asc" },
  });
  return {
    inline_keyboard: [
      ...popupki.map((p) => [
        {
          text: `${p.Check ? "✅" : " "} ${p.name}`,
          callback_data: `p:${p.id}`,
        },
      ]),
      [
        { text: "➕", callback_data: "add" },
        { text: "📃", callback_data: "list" },
        { text: "🔙", callback_data: "back" },
        { text: "🗑️", callback_data: "clear" },
      ],
    ],
  };
};

/** Strip a `@botname` suffix so `/popupki@popupki_bot` matches `/popupki`. */
const commandOf = (text: string): string | undefined =>
  text.trim().split(/\s+/)[0]?.split("@")[0];

/** Is this message the user's answer to our "Enter good(s) name" prompt? */
const isAddReply = (msg: Message, botId: number): boolean =>
  msg.reply_to_message?.from?.id === botId &&
  msg.reply_to_message.text === ADD_PROMPT;

const toggle = async (chatId: number, id: number) => {
  const p = await prisma.popupka.findFirst({
    where: { id, chatId: String(chatId) },
    include: { Check: true },
  });
  if (!p) {
    return;
  }
  if (p.Check) {
    await prisma.check.deleteMany({ where: { popupkaId: p.id } });
  } else {
    // A repeated tap or a redelivered update must not fail on the unique key.
    await prisma.check.upsert({
      where: { popupkaId: p.id },
      create: { popupkaId: p.id },
      update: {},
    });
  }
};

export const createBot = (token: string): Bot => {
  const bot = new Bot(token);
  // A bot token is "<bot id>:<secret>", so the id needs no getMe call.
  const botId = Number(token.split(":")[0]);

  bot.on("message", async (ctx) => {
    const msg = ctx.message;
    if (!msg?.text) {
      return;
    }
    const chatId = msg.chat.id;

    if (isAddReply(msg, botId)) {
      const names = msg.text
        .split("\n")
        .map((n) => n.trim())
        .filter(Boolean);
      if (names.length > 0) {
        await prisma.popupka.createMany({
          data: names.map((name) => ({ name, chatId: String(chatId) })),
          skipDuplicates: true,
        });
      }
      // Tidy up the prompt; needs delete rights in groups, so failure is fine.
      await ctx.api
        .deleteMessage({ chat_id: chatId, message_id: msg.reply_to_message!.message_id })
        .catch(() => undefined);
      await ctx.reply("Popupki:", { reply_markup: await listKeyboard(chatId) });
      return;
    }

    switch (commandOf(msg.text)) {
      case "/popupki":
        await ctx.reply("Popupki:", { reply_markup: await listKeyboard(chatId) });
        return;
      case "/clear":
        await ctx.reply("Are you sure?", {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Yes", callback_data: "clear:yes" },
                { text: "No", callback_data: "clear:no" },
              ],
            ],
          },
        });
        return;
      case "/help":
        await ctx.reply(HELP_MESSAGE);
        return;
    }
  });

  bot.on("callback_query", async (ctx) => {
    const cq = ctx.callbackQuery;
    // Stop the client-side spinner; a stale query is not worth failing over.
    await ctx.answerCallbackQuery().catch(() => undefined);
    const message = cq?.message;
    const data = cq?.data;
    if (!message || !data) {
      return;
    }
    const chatId = message.chat.id;
    const where = { chat_id: chatId, message_id: message.message_id };
    const redraw = async () =>
      ctx.api
        .editMessageReplyMarkup({ ...where, reply_markup: await listKeyboard(chatId) })
        // "message is not modified" when nothing changed; harmless.
        .catch(() => undefined);

    if (data === "add") {
      await ctx.api.sendMessage({
        chat_id: chatId,
        text: ADD_PROMPT,
        reply_markup: { force_reply: true, input_field_placeholder: "milk" },
      });
    } else if (data.startsWith("p:")) {
      await toggle(chatId, Number(data.slice(2)));
      await redraw();
    } else if (data === "clear") {
      // Deletes checked items in every chat, as the bot always has.
      await prisma.popupka.deleteMany({ where: { Check: { isNot: null } } });
      await redraw();
    } else if (data === "list") {
      const popupki = await prisma.popupka.findMany({
        where: { chatId: String(chatId) },
        orderBy: { id: "asc" },
      });
      await ctx.reply(popupki.map((p) => p.name).join("\n") || "(empty)");
    } else if (data === "back") {
      await ctx.api
        .editMessageReplyMarkup({ ...where, reply_markup: { inline_keyboard: [] } })
        .catch(() => undefined);
    } else if (data === "clear:yes") {
      // Deletes every item in every chat, as /clear always has.
      await prisma.popupka.deleteMany({});
      await ctx.api.editMessageText({ ...where, text: "Cleared" }).catch(() => undefined);
    } else if (data === "clear:no") {
      await ctx.api.editMessageText({ ...where, text: "Not cleared" }).catch(() => undefined);
    }
  });

  bot.catch((err, ctx) => {
    console.error(`update ${ctx.update.update_id} failed`, err);
  });

  return bot;
};
