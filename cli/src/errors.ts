import type { ErrorCode } from "@todo-cat/contract";

// Every failure the CLI reports: the API's error codes plus a few of its own.
// Agents branch on the code (stderr) or the exit code, not on the message.
export type CliErrorCode =
  | ErrorCode
  | "invalid-usage"
  | "access-denied"
  | "login-expired"
  | "server-unreachable"
  | "unexpected-response"
  | "internal-error";

export const EXIT_CODES: Record<CliErrorCode, number> = {
  "unexpected-response": 1,
  "internal-error": 1,
  "invalid-usage": 2,
  "validation-failed": 2,
  unauthorized: 3,
  "access-denied": 3,
  "login-expired": 3,
  "todo-not-found": 4,
  "server-unreachable": 5,
};

export class CliError extends Error {
  constructor(
    readonly code: CliErrorCode,
    message: string,
  ) {
    super(message);
  }

  get exitCode(): number {
    return EXIT_CODES[this.code];
  }
}
