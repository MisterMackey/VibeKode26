import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import "dotenv/config";

const url = process.env.DATABASE_URL;
if (!url?.startsWith("file:")) {
  throw new Error("db:reset only works with a local file: DATABASE_URL");
}

const file = url.slice("file:".length);
for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  rmSync(file + suffix, { force: true });
}
execFileSync("npx", ["drizzle-kit", "migrate"], { stdio: "inherit" });
