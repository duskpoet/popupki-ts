import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "./generated/prisma/client";

if (process.env.DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL is not defined");
}

/** Exported so the Neon Function can hand it to `attachDatabasePool`. */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

export const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
  errorFormat: "pretty",
});
