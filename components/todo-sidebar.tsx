import type { Todo } from "@todo-cat/contract";

// Read-only: the browser changes the list only by talking to Lissie. Rendered on
// the server from the todo service; the chat calls router.refresh() when she
// changes something, which re-renders this with the new list.

function Section({ title, todos }: { title: string; todos: Todo[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
        {title} ({todos.length})
      </h2>
      {todos.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing. Suspicious.</p>
      ) : (
        <ul className="space-y-1.5">
          {todos.map((todo) => (
            <li key={todo.id} className="text-sm text-black dark:text-zinc-50">
              <span className={todo.done ? "line-through opacity-60" : ""}>
                {todo.title}
              </span>
              {todo.dueDate && !todo.done ? (
                <span className="ml-2 text-xs text-zinc-500">
                  due {todo.dueDate}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TodoSidebar({ todos }: { todos: Todo[] }) {
  return (
    <aside
      aria-label="Your list"
      className="max-h-56 shrink-0 space-y-5 overflow-y-auto border-t border-black/[.08] bg-white p-4 md:max-h-none md:w-80 md:border-t-0 md:border-l dark:border-white/[.145] dark:bg-zinc-900"
    >
      <Section title="Open" todos={todos.filter((todo) => !todo.done)} />
      <Section title="Done" todos={todos.filter((todo) => todo.done)} />
    </aside>
  );
}
