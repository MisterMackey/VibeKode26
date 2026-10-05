#!/usr/bin/env node
import { Command, CommanderError, Option } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { login, logout, whoami } from "./auth";
import { DEFAULT_SERVER, serverUrl } from "./config";
import { CliError, EXIT_CODES } from "./errors";
import { printError } from "./output";
import { add, list, remove, show, update } from "./todos";

// todo-cat: a client of the todo-cat REST API, for AI agents and humans.
// See tech-docs/cli.md for the design rules (output, errors, exit codes, token).

const EXIT_MEANINGS: Record<number, string> = {
  0: "success",
  1: "unexpected server response or internal error",
  2: "invalid usage or input",
  3: "not logged in, or the login was denied or expired",
  4: "todo not found",
  5: "server unreachable",
};

function exitCodeHelp(): string {
  return Object.entries(EXIT_MEANINGS)
    .map(([exit, meaning]) => {
      const codes = Object.entries(EXIT_CODES)
        .filter(([, value]) => value === Number(exit))
        .map(([code]) => code);
      return `  ${exit}  ${meaning}${codes.length ? ` (${codes.join(", ")})` : ""}`;
    })
    .join("\n");
}

const MAIN_HELP = `
Examples:
  $ todo-cat login                              # once; approve the code in a browser
  $ todo-cat add "Buy tuna" --due 2026-10-31
  $ todo-cat list                               # open todos
  $ todo-cat list --status all --text tuna --json
  $ todo-cat done 0b9f3c2e-5d1a-4c47-9a8e-2f6b7c1d4e3a
  $ todo-cat delete 0b9f3c2e-5d1a-4c47-9a8e-2f6b7c1d4e3a --yes

Output:
  Results go to stdout; --json prints one JSON document per line (todos use
  the contract's Todo shape; login prints two). Errors go to stderr as
  "todo-cat: <message> [<code>]", or with --json as
  {"error":{"code":"...","message":"..."}}. The CLI never prompts.

Exit codes:
${exitCodeHelp()}

Environment:
  TODO_CAT_URL         server URL (default ${DEFAULT_SERVER})
  TODO_CAT_CONFIG_DIR  where the login token is kept (default: the user's
                       config directory, e.g. ~/.config/todo-cat)
`;

function examples(...lines: string[]): string {
  return `\nExamples:\n${lines.map((line) => `  $ ${line}`).join("\n")}\n`;
}

// Parse errors happen before options are stored, so look at argv as well.
const wantsJson = (program: Command) =>
  program.opts().json === true || process.argv.includes("--json");

function buildProgram(): Command {
  const program = new Command();
  const json = () => wantsJson(program);

  program
    .name("todo-cat")
    .description(
      "Manage your todo-cat to-do list from the terminal. Lissie is watching.",
    )
    .version(packageJson.version)
    .option("--json", "print machine-readable JSON instead of text")
    .exitOverride()
    .configureOutput({
      // With --json, commander's own stderr text is dropped; report() prints
      // usage errors as JSON instead.
      writeErr: (text) => {
        if (!json()) process.stderr.write(text);
      },
    })
    .showHelpAfterError("(run with --help for usage)")
    .addHelpText("after", MAIN_HELP);

  program
    .command("login")
    .description(
      "Log in by approving a one-time code in the browser (never opens one)",
    )
    .addHelpText(
      "after",
      `
Prints a URL and a code, then waits until someone signed in to todo-cat
approves the code at that URL (or the code expires). Agents: relay the URL and
code to your human; with --json the first line is
{"status":"pending","userCode",...,"verificationUriComplete"} and the last
{"status":"approved","user":{...}}. The token is saved with owner-only
permissions and never printed.
${examples("todo-cat login", "TODO_CAT_URL=https://todo.example.com todo-cat login --json")}`,
    )
    .action(() => login(serverUrl(), json()));

  program
    .command("logout")
    .description("Revoke the session on the server and forget the token")
    .addHelpText("after", examples("todo-cat logout"))
    .action(() => logout(serverUrl(), json()));

  program
    .command("whoami")
    .description("Show the logged-in user; exits 3 when not logged in")
    .addHelpText("after", examples("todo-cat whoami", "todo-cat whoami --json"))
    .action(() => whoami(serverUrl(), json()));

  program
    .command("list")
    .description("List todos, open before done, newest first")
    .addOption(
      new Option("-s, --status <status>", "which todos")
        .choices(["open", "done", "all"])
        .default("open"),
    )
    .option("-t, --text <text>", "only titles containing this (any case)")
    .addHelpText(
      "after",
      examples(
        "todo-cat list",
        "todo-cat list --status all",
        "todo-cat list --text tuna --json",
      ),
    )
    .action((options: { status: string; text?: string }) =>
      list(serverUrl(), json(), options),
    );

  program
    .command("show")
    .description("Show one todo")
    .argument("<id>", "todo id (from list)")
    .addHelpText("after", examples("todo-cat show <id> --json"))
    .action((id: string) => show(serverUrl(), json(), id));

  program
    .command("add")
    .description("Add a todo")
    .argument("<title...>", "title; several words are joined with spaces")
    .option("-d, --due <yyyy-mm-dd>", "due date")
    .addHelpText(
      "after",
      examples(
        'todo-cat add "Buy tuna"',
        "todo-cat add Vet appointment --due 2026-11-03 --json",
      ),
    )
    .action((words: string[], options: { due?: string }) =>
      add(serverUrl(), json(), words.join(" "), options),
    );

  program
    .command("edit")
    .description("Change a todo's title or due date")
    .argument("<id>", "todo id (from list)")
    .option("--title <title>", "new title")
    .option("-d, --due <yyyy-mm-dd>", "new due date")
    .option("--no-due", "remove the due date")
    .addHelpText(
      "after",
      examples(
        'todo-cat edit <id> --title "Buy salmon"',
        "todo-cat edit <id> --due 2026-12-24",
        "todo-cat edit <id> --no-due",
      ),
    )
    .action((id: string, options: { title?: string; due?: string | false }) => {
      if (options.title === undefined && options.due === undefined) {
        throw new CliError(
          "invalid-usage",
          "Nothing to change; pass --title, --due or --no-due.",
        );
      }
      return update(
        serverUrl(),
        json(),
        id,
        {
          title: options.title,
          dueDate: options.due === false ? null : options.due,
        },
        "Updated",
      );
    });

  program
    .command("done")
    .description("Mark a todo as done")
    .argument("<id>", "todo id (from list)")
    .addHelpText("after", examples("todo-cat done <id>"))
    .action((id: string) =>
      update(serverUrl(), json(), id, { done: true }, "Done"),
    );

  program
    .command("reopen")
    .description("Mark a done todo as open again")
    .argument("<id>", "todo id (from list)")
    .addHelpText("after", examples("todo-cat reopen <id>"))
    .action((id: string) =>
      update(serverUrl(), json(), id, { done: false }, "Reopened"),
    );

  program
    .command("delete")
    .description("Delete a todo for good; requires --yes")
    .argument("<id>", "todo id (from list)")
    .option("-y, --yes", "confirm the deletion (there is no prompt)")
    .addHelpText("after", examples("todo-cat delete <id> --yes"))
    .action((id: string, options: { yes?: boolean }) =>
      remove(serverUrl(), json(), id, options),
    );

  return program;
}

// Maps any failure to stderr output and an exit code.
function report(program: Command, error: unknown): number {
  if (error instanceof CommanderError) {
    // --help and --version exit 0; everything else is a usage error that
    // commander has already printed (or left to us with --json).
    if (error.exitCode === 0) return 0;
    if (wantsJson(program)) {
      const message = error.message.replace(/^error: /, "");
      printError(new CliError("invalid-usage", message), true);
    }
    return EXIT_CODES["invalid-usage"];
  }
  const cliError =
    error instanceof CliError
      ? error
      : new CliError("internal-error", String(error));
  printError(cliError, wantsJson(program));
  return cliError.exitCode;
}

const program = buildProgram();
try {
  await program.parseAsync(process.argv);
} catch (error) {
  process.exitCode = report(program, error);
}
