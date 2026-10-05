import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { CliError } from "./errors";

export const DEFAULT_SERVER = "http://localhost:3000";

// The server every command talks to: TODO_CAT_URL or the local dev server.
export function serverUrl(): string {
  const raw = process.env.TODO_CAT_URL || DEFAULT_SERVER;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CliError("invalid-usage", `TODO_CAT_URL is not a URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliError("invalid-usage", `TODO_CAT_URL must be http(s): ${raw}`);
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

// TODO_CAT_CONFIG_DIR, else the platform's per-user config directory.
export function configDir(): string {
  if (process.env.TODO_CAT_CONFIG_DIR) return process.env.TODO_CAT_CONFIG_DIR;
  const base =
    process.platform === "win32"
      ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
      : process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "todo-cat");
}

// Tokens are kept per server URL, so a token is only ever sent to the server
// that issued it, even when TODO_CAT_URL changes.
const AuthFile = z.record(z.string(), z.object({ token: z.string().min(1) }));
type AuthFile = z.infer<typeof AuthFile>;

function authPath(): string {
  return join(configDir(), "auth.json");
}

function readAuthFile(): AuthFile {
  let text: string;
  try {
    text = readFileSync(authPath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  // A corrupt file counts as logged out; the next login rewrites it.
  try {
    return AuthFile.parse(JSON.parse(text));
  } catch {
    return {};
  }
}

// Owner-only directory and file; written to a temp file first and renamed,
// so a crash never leaves a half-written or world-readable token behind.
function writeAuthFile(data: AuthFile): void {
  const dir = configDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const temp = join(dir, `auth.json.${process.pid}.tmp`);
  writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, authPath());
}

export function readToken(server: string): string | null {
  return readAuthFile()[server]?.token ?? null;
}

export function saveToken(server: string, token: string): void {
  writeAuthFile({ ...readAuthFile(), [server]: { token } });
}

export function deleteToken(server: string): void {
  const { [server]: _removed, ...rest } = readAuthFile();
  writeAuthFile(rest);
}
