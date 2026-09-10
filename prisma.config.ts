import "dotenv/config";
import { defineConfig } from "prisma/config";

// Falls back to the docker-compose database so `prisma generate` (which needs no
// connection) works in environments without DATABASE_URL, e.g. the Docker build.
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/postgres";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  },
});
