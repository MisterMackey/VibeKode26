import "server-only";
import { drizzle } from "drizzle-orm/libsql";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export const db = drizzle({ connection: { url } });
