import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ErrorBody, SessionUser, Todo, TodoList } from "@todo-cat/contract";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { afterAll, beforeAll, expect, test } from "vitest";
import { z } from "zod";
import { migrateTempDb } from "../../scripts/with-temp-db";

// The built CLI end to end against a real `next start` server on a spare port,
// with a temp database and a temp config directory. The device code is
// approved with a session from Better Auth's test utils, no browser.
// Needs the production build (`npm run build`; the QA script runs it first).

const root = join(import.meta.dirname, "../..");
const cliBin = join(root, "cli/dist/todo-cat.mjs");
const nextBin = join(root, "node_modules/next/dist/bin/next");

const tempDb = { url: "", cleanup: () => {} };
const configDir = mkdtempSync(join(tmpdir(), "todo-cat-config-"));
const secret = randomBytes(32).toString("base64");
let baseUrl = "";
let server: ChildProcess | undefined;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("no port")),
      );
    });
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${url}/api/auth/get-session`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server at ${url} did not start`);
}

beforeAll(async () => {
  if (!existsSync(join(root, ".next/BUILD_ID"))) {
    throw new Error("No production build; run `npm run build` first.");
  }
  execFileSync("npm", ["run", "build", "--workspace", "todo-cat-cli"], {
    cwd: root,
    stdio: "pipe",
  });

  Object.assign(tempDb, migrateTempDb());
  const port = await freePort();
  baseUrl = `http://localhost:${port}`;
  const env = {
    DATABASE_URL: tempDb.url,
    BETTER_AUTH_URL: baseUrl,
    BETTER_AUTH_SECRET: secret,
  };
  server = spawn(process.execPath, [nextBin, "start", "--port", `${port}`], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "ignore",
  });
  await waitForServer(baseUrl, 60_000);
  // This process's auth instance (for testUtils) must share the server's
  // database and secret, so its session cookies are valid on the server.
  Object.assign(process.env, env);
}, 120_000);

afterAll(() => {
  server?.kill();
  tempDb.cleanup();
  rmSync(configDir, { recursive: true, force: true });
});

type Run = { code: number | null; stdout: string; stderr: string };

// Starts the built CLI; `done` resolves when it exits.
function start(args: string[]) {
  const child = spawn(process.execPath, [cliBin, ...args], {
    env: {
      ...process.env,
      TODO_CAT_URL: baseUrl,
      TODO_CAT_CONFIG_DIR: configDir,
    },
  });
  const output = { stdout: "", stderr: "" };
  child.stdout.on("data", (chunk) => {
    output.stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output.stderr += chunk;
  });
  const done = new Promise<Run>((resolve) =>
    child.on("close", (code) => resolve({ code, ...output })),
  );
  return { output, done };
}

const cli = (...args: string[]) => start(args).done;

function json<T>(schema: z.ZodType<T>, text: string): T {
  return schema.parse(JSON.parse(text));
}

// The CLI's error output has the API's ErrorBody shape, with a few codes of
// its own on top (e.g. invalid-usage).
const CliErrorBody = z.object({
  error: ErrorBody.shape.error.extend({ code: z.string() }),
});

function errorCode(run: Run): string {
  return json(CliErrorBody, run.stderr).error.code;
}

async function waitFor<T>(read: () => T | undefined): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("timed out waiting");
}

// Signs a user in through Better Auth's test utils and approves the code on
// the running server, as the /device page would.
async function approve(userCode: string) {
  const { authOptions } = await import("@/lib/auth");
  const testAuth = betterAuth({
    ...authOptions,
    plugins: [...authOptions.plugins, testUtils()],
  });
  const { test: helpers } = await testAuth.$context;
  const user = await helpers.saveUser(
    helpers.createUser({ name: "Max", email: "max@example.com" }),
  );
  const { headers } = await helpers.login({ userId: user.id });
  headers.set("origin", baseUrl);

  const query = new URLSearchParams({ user_code: userCode });
  const claimed = await fetch(`${baseUrl}/api/auth/device?${query}`, {
    headers,
  });
  expect(claimed.status).toBe(200);

  headers.set("content-type", "application/json");
  const approved = await fetch(`${baseUrl}/api/auth/device/approve`, {
    method: "POST",
    headers,
    body: JSON.stringify({ userCode }),
  });
  expect(approved.status).toBe(200);
  return user;
}

test("login, whoami, add, list, done, delete, logout", async () => {
  // login: prints the code, polls, saves the token once the code is approved.
  const login = start(["login", "--json"]);
  const pending = await waitFor(() => {
    const [first] = login.output.stdout.split("\n");
    return login.output.stdout.includes("\n") ? first : undefined;
  });
  const { userCode, verificationUri } = json(
    z.object({ userCode: z.string(), verificationUri: z.string() }),
    pending,
  );
  expect(verificationUri).toBe(`${baseUrl}/device`);
  const user = await approve(userCode);

  const loggedIn = await login.done;
  expect(loggedIn.code).toBe(0);
  const approved = loggedIn.stdout.trim().split("\n").at(-1) ?? "";
  expect(
    json(
      z.object({ status: z.literal("approved"), user: SessionUser }),
      approved,
    ).user.email,
  ).toBe(user.email);

  // The token file is owner-only and the token is never printed.
  const authFile = join(configDir, "auth.json");
  expect(statSync(authFile).mode & 0o777).toBe(0o600);
  expect(statSync(configDir).mode & 0o777).toBe(0o700);
  const token = Object.values(
    JSON.parse(readFileSync(authFile, "utf8")) as Record<
      string,
      { token: string }
    >,
  )[0]?.token;
  expect(token).toBeTruthy();
  expect(loggedIn.stdout + loggedIn.stderr).not.toContain(token);

  // whoami
  const whoami = await cli("whoami", "--json");
  expect(whoami.code).toBe(0);
  expect(json(z.object({ user: SessionUser }), whoami.stdout).user.email).toBe(
    user.email,
  );
  expect((await cli("whoami")).stdout).toContain("max@example.com");

  // add
  const added = await cli(
    "add",
    "Buy",
    "tuna",
    "--due",
    "2026-10-31",
    "--json",
  );
  expect(added.code).toBe(0);
  const todo = json(Todo, added.stdout);
  expect(todo).toMatchObject({ title: "Buy tuna", dueDate: "2026-10-31" });
  const invalid = await cli("add", "Vet", "--due", "next friday", "--json");
  expect(invalid.code).toBe(2);
  expect(errorCode(invalid)).toBe("validation-failed");

  // list
  const listed = await cli("list", "--json");
  expect(listed.code).toBe(0);
  expect(json(TodoList, listed.stdout)).toEqual([todo]);
  expect((await cli("list")).stdout).toContain(`[ ] ${todo.id}  Buy tuna`);

  // done
  const done = await cli("done", todo.id, "--json");
  expect(done.code).toBe(0);
  expect(json(Todo, done.stdout).done).toBe(true);
  expect(json(TodoList, (await cli("list", "--json")).stdout)).toEqual([]);
  const doneList = await cli("list", "--status", "done", "--json");
  expect(json(TodoList, doneList.stdout).map((t) => t.id)).toEqual([todo.id]);

  // delete: refused without --yes, then gone
  const refused = await cli("delete", todo.id, "--json");
  expect(refused.code).toBe(2);
  expect(errorCode(refused)).toBe("invalid-usage");
  const deleted = await cli("delete", todo.id, "--yes", "--json");
  expect(deleted.code).toBe(0);
  expect(JSON.parse(deleted.stdout)).toEqual({ id: todo.id, deleted: true });
  const missing = await cli("show", todo.id, "--json");
  expect(missing.code).toBe(4);
  expect(errorCode(missing)).toBe("todo-not-found");

  // logout revokes the session on the server, then whoami fails
  const logout = await cli("logout");
  expect(logout.code).toBe(0);
  const revoked = await fetch(`${baseUrl}/api/todos`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(revoked.status).toBe(401);

  const afterLogout = await cli("whoami", "--json");
  expect(afterLogout.code).toBe(3);
  expect(errorCode(afterLogout)).toBe("unauthorized");
  expect(afterLogout.stdout).toBe("");
}, 60_000);
