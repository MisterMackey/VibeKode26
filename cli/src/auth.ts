import {
  CLI_CLIENT_ID,
  DeviceCode,
  DeviceToken,
  DeviceTokenError,
  Session,
  type SessionUser,
} from "@todo-cat/contract";
import { notLoggedIn, parseReply, requireToken, send } from "./api";
import { deleteToken, readToken, saveToken } from "./config";
import { CliError } from "./errors";
import { printJson, printText } from "./output";

// login, logout and whoami, all against Better Auth's endpoints under /api/auth.
// login is the device authorization flow (RFC 8628): print a code and a URL,
// never open a browser, poll until the user approves on /device.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Groups the code for reading aloud and typing: ABCDEFGH -> ABCD-EFGH.
// The approval page ignores the dash.
function readableCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

async function pollForToken(server: string, code: DeviceCode): Promise<string> {
  let interval = code.interval * 1000;
  const deadline = Date.now() + code.expires_in * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const reply = await send(server, "POST", "/api/auth/device/token", {
      body: {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: code.device_code,
        client_id: CLI_CLIENT_ID,
      },
    });
    if (reply.status === 200) {
      return parseReply(DeviceToken, reply).access_token;
    }
    const { error, error_description } = parseReply(DeviceTokenError, reply);
    if (error === "authorization_pending") continue;
    if (error === "slow_down") {
      interval += 5000;
      continue;
    }
    if (error === "access_denied") {
      throw new CliError("access-denied", "The login request was denied.");
    }
    if (error === "expired_token") break;
    throw new CliError(
      "unexpected-response",
      `Login failed: ${error_description}`,
    );
  }
  throw new CliError(
    "login-expired",
    "The login code expired before it was approved. Run `todo-cat login` again.",
  );
}

async function fetchUser(server: string, token: string): Promise<SessionUser> {
  const reply = await send(server, "GET", "/api/auth/get-session", { token });
  const session = reply.status === 200 ? parseReply(Session, reply) : null;
  if (!session) throw notLoggedIn();
  return session.user;
}

// Ends the session on the server. A token the server no longer knows counts
// as revoked.
async function revoke(server: string, token: string): Promise<void> {
  const reply = await send(server, "POST", "/api/auth/sign-out", {
    token,
    body: {},
  });
  if (reply.status >= 500) {
    throw new CliError(
      "unexpected-response",
      `The server answered ${reply.status} while revoking the session`,
    );
  }
}

export async function login(server: string, json: boolean): Promise<void> {
  const reply = await send(server, "POST", "/api/auth/device/code", {
    body: { client_id: CLI_CLIENT_ID },
  });
  if (reply.status !== 200) {
    throw new CliError(
      "unexpected-response",
      `Could not start the login: the server answered ${reply.status}`,
    );
  }
  const code = parseReply(DeviceCode, reply);

  if (json) {
    printJson({
      status: "pending",
      userCode: code.user_code,
      verificationUri: code.verification_uri,
      verificationUriComplete: code.verification_uri_complete,
      expiresIn: code.expires_in,
    });
  } else {
    printText(
      [
        `Open ${code.verification_uri} in a browser where you are signed in to todo-cat and enter this code:`,
        "",
        `    ${readableCode(code.user_code)}`,
        "",
        `Or open ${code.verification_uri_complete}`,
        `The code expires in ${Math.round(code.expires_in / 60)} minutes. Waiting for approval...`,
      ].join("\n"),
    );
  }

  const token = await pollForToken(server, code);
  const previous = readToken(server);
  saveToken(server, token);
  if (previous && previous !== token) {
    await revoke(server, previous).catch(() => {});
  }

  const user = await fetchUser(server, token);
  if (json) printJson({ status: "approved", server, user });
  else printText(`Logged in to ${server} as ${user.name} <${user.email}>.`);
}

export async function whoami(server: string, json: boolean): Promise<void> {
  const user = await fetchUser(server, requireToken(server));
  if (json) printJson({ server, user });
  else printText(`Logged in to ${server} as ${user.name} <${user.email}>.`);
}

export async function logout(server: string, json: boolean): Promise<void> {
  const token = readToken(server);
  if (token) {
    // Forget the token even if revoking fails: a token kept on disk is the
    // bigger risk. The failure still reaches the caller.
    try {
      await revoke(server, token);
    } catch (error) {
      deleteToken(server);
      if (!(error instanceof CliError)) throw error;
      throw new CliError(
        error.code,
        `Removed the local token, but could not revoke the session on the server (it expires on its own): ${error.message}`,
      );
    }
    deleteToken(server);
  }
  if (json) printJson({ server, loggedOut: true });
  else if (token) printText(`Logged out of ${server}; the session is revoked.`);
  else printText(`Not logged in to ${server}; nothing to do.`);
}
