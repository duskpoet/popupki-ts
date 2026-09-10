# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Popupki is a Telegram bot for managing a shared shopping list ("popupki" = purchases). Node.js 22+ / TypeScript 7, Prisma 7 over PostgreSQL via the `pg` driver adapter, `node-telegram-bot-api` v2. Three hand-written source files in `src/`; no tests, no linter. Package manager is npm (`package-lock.json`).

## Commands

```bash
docker compose up -d db          # local Postgres 15 on :5432 (postgres/postgres/postgres)
npm install                      # also run `npx prisma generate` afterwards
npx prisma generate              # emits the client to src/generated/prisma (gitignored); rerun after schema edits
npx prisma migrate dev           # apply migrations + regenerate client (needs a reachable DB)
npm run dev                      # tsx watch src/index.ts
npm run typecheck                # tsc --noEmit
npm run build                    # rm -rf dist && tsc  (dist/generated is the compiled client)
npm start                        # node dist/index.js
```

Required env (loaded from `.env` via dotenv; see `.env.example`): `BOT_TOKEN`, `DATABASE_URL`.
Optional: `PORT` + `HOST`. If both are set the bot runs in webhook mode: it calls `setWebhook` with `${HOST}/telegram` and a secret token (`WEBHOOK_SECRET`, or a random one per boot), then serves on `PORT`. Otherwise it deletes any webhook and long-polls. Locally, leave them unset.

Prisma 7 specifics: `prisma.config.ts` (not the schema) holds the datasource URL and falls back to the docker-compose URL when `DATABASE_URL` is unset so `prisma generate` works anywhere. The schema uses the `prisma-client` generator with `output = "../src/generated/prisma"`; `src/db.ts` imports `PrismaClient` from there and must pass a `PrismaPg` adapter. `@prisma/client` is only the runtime; the generated code is compiled by `tsc` into `dist/generated`.

TypeScript 7 (native compiler): `tsconfig.json` uses `module: nodenext` so the `node-telegram-bot-api/node` subpath export resolves; output is CommonJS because `package.json` has no `"type": "module"`. `ts-node` does not work with TS 7, hence `tsx` for `npm run dev`.

## Architecture: channels, not handlers

The bot does not use per-command callback handlers. It models each chat as a sequential coroutine communicating over Go-style channels (`@nodeguy/channel`, from a fork pinned to `duskpoet/channel#main`).

- `src/index.ts` — wiring. `bot.on("message")` / `bot.on("callback_query")` handlers push the raw `Message` / `CallbackQuery` (from `ctx.message` / `ctx.callbackQuery`) onto one `globalQueue`; callback queries are also answered immediately to clear the client spinner. A single dispatcher loop pulls from it, derives the `chatId`, and routes to the per-chat `Dialog` in the `dialogs` map, creating one if absent.
- A `Dialog` is `{ in, out }`: `in` carries Telegram updates into the dialog coroutine, `out` carries `SendMessagePayload` (`{ text, options }`, where `options` is `SendMessageParams` minus `chat_id`/`text`) back; a companion loop drains `out` into `bot.api.sendMessage({ chat_id, text, ...options })`. When the coroutine returns (or throws), both channels are closed and the dialog is deleted from the map, so the next message for that chat starts a fresh dialog.
- `src/dialog.ts` — the conversation logic. `goDialog` reads the first message and switches on the command (`/popupki`, `/clear`, `/help`; any `@botname` suffix and trailing args are stripped first). Sub-flows like `processPopupki` are plain `while (true)` loops that `await inChannel.shift()` for the user's next tap/message, so multi-step interactions (e.g. "➕" then wait for the item name) read top-to-bottom instead of as state machines. `break`ing out of the loop ends the dialog.
- `BreakError` lets a dialog abort and re-inject the triggering update into `globalQueue` so it is handled by a fresh dialog. It is defined and caught in `index.ts` but nothing currently throws it.
- `src/db.ts` — the singleton `PrismaClient`.

Consequences to keep in mind when editing:
- Only one dialog per chat runs at a time; an update arriving mid-flow is consumed by whatever `inChannel.shift()` is currently awaiting, whatever it expected. Guard with `"data" in pick` / `"text" in msg` checks as the existing code does.
- Inline-keyboard buttons are identified by `callback_data` strings (`add`, `list`, `back`, `clear`, `p:<id>`); the dialog loop re-renders the whole keyboard on each iteration.
- `dialog.ts` uses only the wire types (`Message`, `CallbackQuery`, `SendMessageParams`) from `node-telegram-bot-api`, never `Context` or `Bot`; all API calls live in `index.ts`. Channel `shift()` resolves `undefined` once the channel is closed, so every read is guarded.

## Data model (`prisma/schema.prisma`)

`Popupka` = a list item (`name` is globally `@unique`, not per-chat; `chatId` stored as a string). `Check` = a one-to-one "bought" marker on a `Popupka`, cascade-deleted with it. Ticking an item creates/deletes its `Check` row; the 🗑️ button deletes all checked items; `/clear` deletes every `Popupka` in the whole database, not just the current chat's.

Migrations live in `prisma/migrations/`; add new ones with `npx prisma migrate dev --name <name>`.

## Deployment

Dockerfile builds from `node:24-alpine`: `npm ci` → `prisma generate` → `tsc` → `npm prune --omit=dev`, then runs `dist/index.js`. Nothing runs migrations automatically; use `npm run prisma:deploy` against the production `DATABASE_URL`. `fly.toml` names the Fly.io app `popupki`; set `PORT`/`HOST` there so production runs in webhook mode.
