import { ReadWriteChannel } from "@nodeguy/channel";
import type {
  CallbackQuery,
  Message,
  SendMessageParams,
} from "node-telegram-bot-api";
import { prisma } from "./db";

export type ExtendedMessage = Message | CallbackQuery;

export type SendMessagePayload = {
  text: string;
  options?: Omit<SendMessageParams, "chat_id" | "text">;
};
export type Dialog = {
  in: ReadWriteChannel<ExtendedMessage>;
  out: ReadWriteChannel<SendMessagePayload>;
};

const HELP_MESSAGE = `
 This is bot designed to help you with your shopping list.
 To start using it, add it to your group and type /popupki.
`;

const processPopupki = async (
  chatId: number,
  inChannel: ReadWriteChannel<ExtendedMessage>,
  outChannel: ReadWriteChannel<SendMessagePayload>,
) => {
  while (true) {
    const popupki = await prisma.popupka.findMany({
      where: {
        chatId: String(chatId),
      },
      include: {
        Check: true,
      },
    });
    await outChannel.push({
      text: "Popupki:",
      options: {
        reply_markup: {
          inline_keyboard: [
            ...popupki.map((popupka) => [
              {
                text: `${popupka.Check ? "✅" : " "} ${popupka.name}`,
                callback_data: `p:${popupka.id}`,
              },
            ]),
            [
              {
                text: "➕",
                callback_data: "add",
              },
              {
                text: "📃",
                callback_data: "list",
              },
              {
                text: "🔙",
                callback_data: "back",
              },
              { text: "🗑️", callback_data: "clear" },
            ],
          ],
        },
      },
    });
    const pick = await inChannel.shift();
    if (pick === undefined) {
      break;
    }
    if ("data" in pick) {
      const data = pick.data;
      if (data === "add") {
        await outChannel.push({
          text: "Enter good(s) name",
        });
        const good = await inChannel.shift();
        if (good !== undefined && "text" in good && good.text) {
          try {
            const goods = good.text.split("\n");
            await prisma.popupka.createMany({
              data: goods.map((gName) => ({
                name: gName,
                chatId: String(chatId),
              })),
              skipDuplicates: true,
            });
          } catch (e) {
            console.log(e);
          }
        }
      }
      if (data === "back") {
        await outChannel.push({
          text: "Main menu",
        });
        break;
      }
      if (data === "list") {
        await outChannel.push({
          text: popupki.map((p) => p.name).join("\n"),
        });
        break;
      }
      if (data === "clear") {
        await prisma.popupka.deleteMany({
          where: {
            Check: {
              isNot: null,
            },
          },
        });
      }
      if (data && data.startsWith("p:")) {
        const id = data.split(":").slice(1).join(":");
        const p = popupki.find((popupka) => popupka.id === +id);
        if (p) {
          if (p.Check) {
            await prisma.check.delete({
              where: {
                id: p.Check.id,
              },
            });
          } else {
            await prisma.check.create({
              data: {
                popupkaId: p.id,
              },
            });
          }
        }
      }
    } else {
      break;
    }
  }
};

const processClear = async (
  _chatId: number,
  inChannel: ReadWriteChannel<ExtendedMessage>,
  outChannel: ReadWriteChannel<SendMessagePayload>,
) => {
  await outChannel.push({
    text: "Are you sure?",
    options: {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Yes",
              callback_data: "yes",
            },
            {
              text: "No",
              callback_data: "no",
            },
          ],
        ],
      },
    },
  });
  const pick = await inChannel.shift();
  if (pick !== undefined && "data" in pick) {
    if (pick.data === "yes") {
      await prisma.popupka.deleteMany({});
      await outChannel.push({
        text: "Cleared",
      });
    }
  }
};

/** Strip a `@botname` suffix so `/popupki@popupki_bot` matches `/popupki`. */
const commandOf = (message: ExtendedMessage): string | undefined => {
  if (!("text" in message) || !message.text) {
    return undefined;
  }
  return message.text.trim().split(/\s+/)[0]?.split("@")[0];
};

export const goDialog = async (
  chatId: number,
  chIn: ReadWriteChannel<ExtendedMessage>,
  chOut: ReadWriteChannel<SendMessagePayload>,
) => {
  const message = await chIn.shift();
  if (message === undefined) {
    return;
  }
  switch (commandOf(message)) {
    case "/popupki": {
      await processPopupki(chatId, chIn, chOut);
      return;
    }
    case "/clear": {
      await processClear(chatId, chIn, chOut);
      return;
    }
    case "/help": {
      await chOut.push({ text: HELP_MESSAGE });
      return;
    }
  }
};

export class BreakError extends Error {
  constructor(public data: ExtendedMessage) {
    super("Break");
  }
}
