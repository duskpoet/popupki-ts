import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: false,
  functions: {
    // Telegram webhook endpoint; DATABASE_URL is injected by Neon.
    telegram: {
      name: "Popupki Telegram webhook",
      source: "./functions/telegram.ts",
      env: {
        BOT_TOKEN: { value: process.env.BOT_TOKEN, required: true },
        WEBHOOK_SECRET: { value: process.env.WEBHOOK_SECRET, required: true },
      },
    },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      return { ttl: "7d" };
    }
    return {};
  },
});
