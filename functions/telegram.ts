import { attachDatabasePool } from "@neon/functions";
import { webhookCallback } from "node-telegram-bot-api";

// Telegram webhook entry point, deployed as a Neon Function (see neon.ts).
// Point Telegram at it with scripts/set-webhook.ts.

type Handler = (request: Request) => Promise<Response>;

// Built on the first request, not at module load, so a startup failure
// (a missing env var, an unreachable database) is logged and answered with a
// 500 instead of the platform's opaque "function temporarily unavailable".
let handler: Promise<Handler> | undefined;

const init = async (): Promise<Handler> => {
  const { BOT_TOKEN, WEBHOOK_SECRET } = process.env;
  const missing = ["BOT_TOKEN", "WEBHOOK_SECRET", "DATABASE_URL"].filter(
    (k) => !process.env[k],
  );
  if (missing.length > 0) {
    throw new Error(`missing env: ${missing.join(", ")}`);
  }
  const { pool } = await import("../src/db");
  const { createBot } = await import("../src/bot");
  // An idle connection dropped by Postgres must not become an uncaught exception.
  attachDatabasePool(pool);
  // Rejects requests without Telegram's X-Telegram-Bot-Api-Secret-Token header
  // (401) and awaits the handler before answering, so the instance stays alive
  // until the update is fully processed.
  return webhookCallback(createBot(BOT_TOKEN!), { secretToken: WEBHOOK_SECRET! });
};

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      handler ??= init();
      const handle = await handler;
      if (request.method !== "POST") {
        return new Response("popupki", { status: 200 });
      }
      return await handle(request);
    } catch (e) {
      handler = undefined;
      console.error("popupki function failed", e);
      return new Response(`startup failed: ${(e as Error).message}`, { status: 500 });
    }
  },
};
