import { ReadWriteChannel } from "@nodeguy/channel";
import {
  ChatId,
  SendMessageOptions,
  Message,
  CallbackQuery,
} from "node-telegram-bot-api";
import { prisma } from "./db";

export type SendMessagePayload = {
  text: string;
  options?: SendMessageOptions;
};
export type Dialog = {
  in: ReadWriteChannel<Message | CallbackQuery>;
  out: ReadWriteChannel<SendMessagePayload>;
};

const HELP_MESSAGE = `
 This is bot designed to help you with your shopping list.
 To start using it, add it to your group and type /popupki.
`;

const processPopupki = async (
  chatId: ChatId,
  inChannel: ReadWriteChannel<Message | CallbackQuery>,
  outChannel: ReadWriteChannel<SendMessagePayload>
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
              {
                text: '✏️"',
                callback_data: `r:${popupka.id}`,
              },
              {
                text: "🗑",
                callback_data: `d:${popupka.id}`,
              },
            ]),
            [
              {
                text: "Add",
                callback_data: "add",
              },
              {
                text: "Back",
                callback_data: "back",
              },
            ],
          ],
        },
      },
    });
    const pick = await inChannel.shift();
    if ("data" in pick) {
      const data = pick.data;
      if (data === "add") {
        await outChannel.push({
          text: "Enter good name",
        });
        const good = await inChannel.shift();
        if ("text" in good && good.text) {
          try {
            await prisma.popupka.create({
              data: {
                name: good.text,
                chatId: String(chatId),
              },
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
      if (data && data.startsWith("d:")) {
        const id = data.split(":").slice(1).join(":");
        const p = popupki.find((popupka) => popupka.id === +id);
        if (p) {
          await prisma.popupka.delete({
            where: {
              id: p.id,
            },
          });
        }
      }
      if (data && data.startsWith("r:")) {
        const id = data.split(":").slice(1).join(":");
        const p = popupki.find((popupka) => popupka.id === +id);
        if (p) {
          await outChannel.push({
            text: "Enter new name",
          });
          const good = await inChannel.shift();
          if ("text" in good && good.text) {
            try {
              await prisma.popupka.update({
                where: {
                  id: p.id,
                },
                data: {
                  name: good.text,
                },
              });
            } catch (e) {
              console.log(e);
            }
          }
        }
      }
    } else {
      break;
    }
  }
};

export const goDialog = async (
  chatId: ChatId,
  chIn: ReadWriteChannel<Message>,
  chOut: ReadWriteChannel<SendMessagePayload>
) => {
  const message = await chIn.shift();
  switch (message.text) {
    case "/popupki":
    case "/popupki@popupki_bot": {
      await processPopupki(chatId, chIn, chOut);
      return;
    }
    case "/help":
    case "/help@popupki_bot": {
      await chOut.push({ text: HELP_MESSAGE });
      return;
    }
  }
};
