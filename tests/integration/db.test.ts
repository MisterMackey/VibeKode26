import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";
import { migrateTempDb } from "../../scripts/with-temp-db";

const tempDb = { url: "", cleanup: () => {} };

beforeAll(() => {
  Object.assign(tempDb, migrateTempDb());
  process.env.DATABASE_URL = tempDb.url;
}, 60_000);

afterAll(() => tempDb.cleanup());

test("lib/db connects to a freshly migrated database", async () => {
  const { db } = await import("@/lib/db");

  const ping = await db.run(sql`select 1 as ok`);
  expect(ping.rows[0]?.ok).toBe(1);

  const migrations = await db.run(
    sql`select count(*) as n from __drizzle_migrations`,
  );
  expect(Number(migrations.rows[0]?.n)).toBeGreaterThan(0);
});
