# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Popupki is a Telegram bot for managing a shared shopping list ("popupki" = purchases). Node.js 22+ / TypeScript 7, Prisma 7 over PostgreSQL via the `pg` driver adapter, `node-telegram-bot-api` v2. In production it runs as a **Neon Function** that Telegram calls as its webhook; the same handlers also run as a long-lived process for local development. No tests, no linter. Package manager is npm (`package-lock.json`).

## Commands

```bash
docker compose up -d db          # local Postgres 15 on :5432 (postgres/postgres/postgres)
npm install                      # also run `npx prisma generate` afterwards
npx prisma generate              # emits the client to src/generated/prisma (gitignored); rerun after schema edits
npx prisma migrate dev           # apply migrations + regenerate client (needs a reachable DB)
npm run dev                      # tsx watch src/index.ts (long polling)
npm run typecheck                # tsc --noEmit for src/, then tsconfig.neon.json for neon.ts, functions/, scripts/
npm run build                    # rm -rf dist && tsc  (dist/generated is the compiled client)
npm start                        # node dist/index.js
npm run deploy:function          # neon deploy --env .env  (deploys functions/telegram.ts per neon.ts)
npx tsx scripts/set-webhook.ts <url>   # point the bot in .env at <url> with WEBHOOK_SECRET, and set its commands
neon logs query --branch main --source function --since 1h   # function logs
```

Env (loaded from `.env` via dotenv; see `.env.example`): `BOT_TOKEN`, `DATABASE_URL`, `WEBHOOK_SECRET` (required by the function and by `set-webhook.ts`). `neon link` / `neon deploy` also write Neon-managed vars into `.env` (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_BRANCH`, `NEON_BRANCH_ID`, `NEON_FUNCTION_HOST_SUFFIX`), overwriting `DATABASE_URL` with the linked branch's pooled URL.

`src/index.ts` modes: with `PORT` + `HOST` set it registers `${HOST}/telegram` as the webhook and serves it itself; otherwise it deletes any webhook and long-polls. **Either mode takes the bot away from the Neon Function** (setWebhook / deleteWebhook on startup), so running `npm run dev` with the production `BOT_TOKEN` breaks production until `set-webhook.ts` is run again. Use a separate dev bot token locally.

Prisma 7 specifics: `prisma.config.ts` (not the schema) holds the datasource URL and falls back to the docker-compose URL when `DATABASE_URL` is unset so `prisma generate` works anywhere. The schema uses the `prisma-client` generator with `output = "../src/generated/prisma"`; `src/db.ts` builds a `pg` `Pool` (max 5) and passes it to `PrismaPg`. `@prisma/client` is only the runtime; the generated code is compiled by `tsc` into `dist/generated`, and bundled by `neon deploy` for the function. Run migrations with the **unpooled** URL: `DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma migrate deploy`.

TypeScript 7 (native compiler): `tsconfig.json` (covers `src/` only) uses `module: nodenext` so the `node-telegram-bot-api/node` subpath export resolves; output is CommonJS because `package.json` has no `"type": "module"`. `@neon/functions` is ESM-only, so `functions/`, `neon.ts` and `scripts/` live outside `src/` and are checked by `tsconfig.neon.json` (bundler resolution, `noEmit`). `ts-node` does not work with TS 7, hence `tsx`.

## Architecture: stateless update handling

`src/bot.ts` — `createBot(token)` registers `message` and `callback_query` handlers on a `node-telegram-bot-api` `Bot`. **Every update is handled on its own; nothing is kept in memory between updates.** This is required because Neon runs several function instances in parallel and evicts idle ones, and there is no setting to pin one instance.

- Commands: `/popupki` sends the list ("Popupki:" + inline keyboard built by `listKeyboard` from the DB), `/clear` sends a Yes/No confirm, `/help` the help text. A `@botname` suffix and trailing args are stripped.
- Buttons are identified by `callback_data`: `p:<id>` toggles the item's `Check` and redraws the keyboard in place (`editMessageReplyMarkup`); `clear` (🗑️) deletes checked items and redraws; `list` (📃) sends names as plain text; `back` (🔙) removes the keyboard; `clear:yes` / `clear:no` answer `/clear`.
- Adding items ("➕") is the only multi-step flow, and its state lives in Telegram: `add` sends `ADD_PROMPT` ("Enter good(s) name") with `force_reply`; the user's answer arrives as a message whose `reply_to_message` is that prompt (`isAddReply` checks sender = bot id parsed from the token, and the text). Each line becomes an item (`createMany`, `skipDuplicates`). Changing `ADD_PROMPT` orphans prompts already sent.
- Handlers must stay idempotent: Telegram redelivers an update if the webhook doesn't answer 2xx in time. `bot.catch` logs and swallows handler errors, so a failed update is answered 200 and not retried.
- Group privacy mode still delivers replies to the bot's own messages, so the add flow works without BotFather changes.

`functions/telegram.ts` — the Neon Function (default export `{ fetch }`). On the first request it checks `BOT_TOKEN`, `WEBHOOK_SECRET`, `DATABASE_URL`, dynamically imports `src/db` / `src/bot`, calls `attachDatabasePool(pool)`, and builds `webhookCallback(bot, { secretToken })`, which answers 401 unless `X-Telegram-Bot-Api-Secret-Token` matches and awaits the handler before replying. GET returns 200 `popupki` (health check). Startup failures are logged and returned as 500 with the reason (no secrets) instead of the platform's opaque 503.

`src/index.ts` — long-running entry point using the same `createBot`. `src/db.ts` — the singleton `Pool` and `PrismaClient`.

## Data model (`prisma/schema.prisma`)

`Popupka` = a list item (`name` is globally `@unique`, not per-chat; `chatId` stored as a string). `Check` = a one-to-one "bought" marker on a `Popupka`, cascade-deleted with it. Ticking an item creates/deletes its `Check` row; the 🗑️ button deletes checked items **in every chat**; `/clear` deletes every `Popupka` in the whole database, not just the current chat's. Lists belong to chats, not bots, so switching bot tokens keeps a group's list.

Migrations live in `prisma/migrations/`; add new ones with `npx prisma migrate dev --name <name>`.

## Deployment

**Production: Neon Functions.** `neon.ts` declares one function, `telegram` (`source: ./functions/telegram.ts`), with `BOT_TOKEN` and `WEBHOOK_SECRET` as required env read from the file passed to `--env`; Neon injects `DATABASE_URL`. The repo is linked (`.neon`, gitignored) to Neon project `popupki_new` (`damp-boat-21007153`, aws-eu-central-1), branch `main`. Function URL: `https://br-young-rice-bgjtxjsk-telegram.compute.c-9.eu-central-1.aws.neon.tech/` (`neon functions get telegram` prints it).

- Code or secret change: `npm run deploy:function`. The webhook URL does not change.
- New bot token: update `BOT_TOKEN` in `.env`, `npm run deploy:function`, then `npx tsx scripts/set-webhook.ts <function url>`; delete the old bot's webhook with its own token.
- Schema change: run the migration against the Neon branch (unpooled URL) before deploying code that needs it.
- The original project `popupki` (`delicate-disk-553877`) could not run Functions (every function, even a trivial one, answered 503 with no logs), which is why the bot moved to a new project.

**Legacy: Docker / Fly.io.** The Dockerfile (`node:24-alpine`: `npm ci` → `prisma generate` → `tsc` → `npm prune --omit=dev`, runs `dist/index.js`) and `fly.toml` (app `popupki`) still work for the long-running mode, but a running Fly instance re-registers or deletes the webhook on startup and would take the bot back from the function. Keep it stopped while the function is in use.
