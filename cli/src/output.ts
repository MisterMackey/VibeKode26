import type { Todo } from "@todo-cat/contract";
import type { CliError } from "./errors";

// Results go to stdout, errors to stderr. With --json, stdout gets exactly
// one JSON document per result and stderr gets the API's error body shape.

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function printText(text: string): void {
  process.stdout.write(`${text}\n`);
}

export function printError(error: CliError, json: boolean): void {
  process.stderr.write(
    json
      ? `${JSON.stringify({ error: { code: error.code, message: error.message } })}\n`
      : `todo-cat: ${error.message} [${error.code}]\n`,
  );
}

// `[x] <id>  Title  (due 2026-10-31)`: one line per todo, full id to copy.
export function todoLine(todo: Todo): string {
  const due = todo.dueDate ? `  (due ${todo.dueDate})` : "";
  return `[${todo.done ? "x" : " "}] ${todo.id}  ${todo.title}${due}`;
}

export function todoDetails(todo: Todo): string {
  return [
    `id:        ${todo.id}`,
    `title:     ${todo.title}`,
    `status:    ${todo.done ? `done (${todo.completedAt})` : "open"}`,
    `due:       ${todo.dueDate ?? "-"}`,
    `created:   ${todo.createdAt}`,
  ].join("\n");
}
