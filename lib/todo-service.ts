import "server-only";
import type {
  CreateTodoInput,
  ErrorCode,
  Todo,
  TodoListFilter,
  UpdateTodoInput,
} from "@todo-cat/contract";
import { and, asc, desc, eq, type SQL, sql } from "drizzle-orm";
import { db } from "./db";
import { todos } from "./schema";

// The only module that touches the `todos` table (see tech-docs/architecture.md).
// Every function takes the owner's user id first and every query filters by it.
// Input is trusted to have passed the contract schemas; ownership never is.
// `now` exists so the dev seed can backdate todos; callers normally omit it.

export class TodoError extends Error {
  constructor(
    readonly code: Extract<ErrorCode, "todo-not-found" | "validation-failed">,
    message: string,
  ) {
    super(message);
    this.name = "TodoError";
  }
}

type TodoRow = typeof todos.$inferSelect;

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.dueDate,
    done: row.done,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

// Another user's todo is "not found", never "forbidden": an id's existence
// must not leak across users.
function notFound(id: string): TodoError {
  return new TodoError("todo-not-found", `Todo ${id} not found`);
}

function owned(userId: string, id: string): SQL | undefined {
  return and(eq(todos.userId, userId), eq(todos.id, id));
}

export async function listTodos(
  userId: string,
  filter: TodoListFilter = { status: "all" },
): Promise<Todo[]> {
  const text = filter.text?.trim();
  const rows = await db
    .select()
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        filter.status === "open" ? eq(todos.done, false) : undefined,
        filter.status === "done" ? eq(todos.done, true) : undefined,
        text
          ? sql`instr(lower(${todos.title}), lower(${text})) > 0`
          : undefined,
      ),
    )
    .orderBy(asc(todos.done), desc(todos.createdAt), asc(todos.id));
  return rows.map(toTodo);
}

export async function getTodo(userId: string, id: string): Promise<Todo> {
  const [row] = await db.select().from(todos).where(owned(userId, id));
  if (!row) throw notFound(id);
  return toTodo(row);
}

export async function addTodo(
  userId: string,
  input: CreateTodoInput,
  now: Date = new Date(),
): Promise<Todo> {
  const [row] = await db
    .insert(todos)
    .values({
      id: crypto.randomUUID(),
      userId,
      title: input.title,
      dueDate: input.dueDate ?? null,
      createdAt: now,
    })
    .returning();
  return toTodo(row);
}

export async function updateTodo(
  userId: string,
  id: string,
  input: UpdateTodoInput,
  now: Date = new Date(),
): Promise<Todo> {
  const current = await getTodo(userId, id);
  const changes: Partial<TodoRow> = {};
  if (input.title !== undefined) changes.title = input.title;
  if (input.dueDate !== undefined) changes.dueDate = input.dueDate;
  // completedAt follows done: set when a todo is marked done, cleared when
  // it's reopened, untouched when done doesn't change.
  if (input.done !== undefined && input.done !== current.done) {
    changes.done = input.done;
    changes.completedAt = input.done ? now : null;
  }
  if (Object.keys(changes).length === 0) return current;

  const [row] = await db
    .update(todos)
    .set(changes)
    .where(owned(userId, id))
    .returning();
  if (!row) throw notFound(id);
  return toTodo(row);
}

export async function deleteTodo(userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(todos)
    .where(owned(userId, id))
    .returning({ id: todos.id });
  if (deleted.length === 0) throw notFound(id);
}
