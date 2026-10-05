import { TodoId, UpdateTodoInput } from "@todo-cat/contract";
import { parse, readJson, withUser } from "@/lib/rest";
import { deleteTodo, getTodo, updateTodo } from "@/lib/todo-service";

type Context = RouteContext<"/api/todos/[id]">;

async function todoId(context: Context): Promise<string> {
  return parse(TodoId, (await context.params).id);
}

// GET /api/todos/:id — one of the caller's todos.
export function GET(request: Request, context: Context) {
  return withUser(request, async (userId) =>
    Response.json(await getTodo(userId, await todoId(context))),
  );
}

// PATCH /api/todos/:id — change title, due date, or done.
export function PATCH(request: Request, context: Context) {
  return withUser(request, async (userId) => {
    const id = await todoId(context);
    const input = parse(UpdateTodoInput, await readJson(request));
    return Response.json(await updateTodo(userId, id, input));
  });
}

// DELETE /api/todos/:id
export function DELETE(request: Request, context: Context) {
  return withUser(request, async (userId) => {
    await deleteTodo(userId, await todoId(context));
    return new Response(null, { status: 204 });
  });
}
