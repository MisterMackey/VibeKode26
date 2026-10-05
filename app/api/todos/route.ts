import { CreateTodoInput, TodoListFilter } from "@todo-cat/contract";
import { parse, readJson, withUser } from "@/lib/rest";
import { addTodo, listTodos } from "@/lib/todo-service";

// GET /api/todos?status=open|done|all&text=... — the caller's todos.
export function GET(request: Request) {
  return withUser(request, async (userId) => {
    const query = new URL(request.url).searchParams;
    const filter = parse(TodoListFilter, {
      status: query.get("status") ?? undefined,
      text: query.get("text") ?? undefined,
    });
    return Response.json(await listTodos(userId, filter));
  });
}

// POST /api/todos — add a todo.
export function POST(request: Request) {
  return withUser(request, async (userId) => {
    const input = parse(CreateTodoInput, await readJson(request));
    return Response.json(await addTodo(userId, input), { status: 201 });
  });
}
