// Runs a command against a fresh, migrated, throwaway database:
//   tsx scripts/with-temp-db.ts <command> [args...]
// The command sees it as DATABASE_URL; the file is deleted afterwards.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function migrateTempDb(): { url: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "todo-cat-db-"));
  const url = `file:${join(dir, "test.db")}`;
  execFileSync("npx", ["drizzle-kit", "migrate"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  return { url, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

if (process.argv[1]?.endsWith("with-temp-db.ts")) {
  const [command, ...args] = process.argv.slice(2);
  if (!command) throw new Error("usage: with-temp-db.ts <command> [args...]");
  const db = migrateTempDb();
  const result = spawnSync(command, args, {
    env: { ...process.env, DATABASE_URL: db.url },
    stdio: "inherit",
  });
  db.cleanup();
  process.exit(result.status ?? 1);
}
