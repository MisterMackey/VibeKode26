// Dev seed: a demo user with a dozen todos spread over the last two weeks.
//   npm run db:seed
// Idempotent: the demo user is created once and their todos are replaced on
// every run, with dates relative to today. Runs under the react-server
// condition so lib/* can import "server-only" outside Next.
import "dotenv/config";

const DEMO = {
  name: "Demo Cat Person",
  email: "demo@todo-cat.dev",
  password: "cat-person-2026",
};

// Days are relative to today: `created` days ago, `due` days from now,
// `done` days ago (when it was completed).
const TODOS: { title: string; created: number; due?: number; done?: number }[] =
  [
    { title: "Buy the good tuna, not the sad tuna", created: 14, done: 13 },
    {
      title: "Book the vet for Lissie's check-up",
      created: 13,
      due: -2,
      done: 3,
    },
    { title: "Replace the scratching post", created: 12, due: 5 },
    { title: "Clean the litter box", created: 11, done: 10 },
    { title: "Return library books", created: 10, due: -1 },
    { title: "Order a new laser pointer", created: 9, done: 6 },
    { title: "Call grandma", created: 7, due: 0 },
    { title: "Fix the wobbly window perch", created: 6 },
    { title: "Renew passport", created: 5, due: 30 },
    { title: "Pay the electricity bill", created: 3, due: 2, done: 1 },
    { title: "Plan weekend hike", created: 2, due: 6 },
    { title: "Vacuum cat hair off the sofa (again)", created: 1 },
  ];

const url = process.env.DATABASE_URL;
if (!url?.startsWith("file:")) {
  throw new Error("db:seed only works with a local file: DATABASE_URL");
}

const { eq } = await import("drizzle-orm");
const { auth } = await import("@/lib/auth");
const { db } = await import("@/lib/db");
const { user } = await import("@/lib/schema");
const { addTodo, deleteTodo, listTodos, updateTodo } = await import(
  "@/lib/todo-service"
);

const today = new Date();
today.setHours(0, 0, 0, 0);

function daysFromToday(days: number, hour = 0): Date {
  const date = new Date(today);
  date.setDate(date.getDate() + days);
  date.setHours(hour);
  return date;
}

// A due date is a local calendar day; never go through toISOString (UTC).
function isoDay(days: number): string {
  const date = daysFromToday(days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const [existing] = await db
  .select({ id: user.id })
  .from(user)
  .where(eq(user.email, DEMO.email));
const userId =
  existing?.id ?? (await auth.api.signUpEmail({ body: DEMO })).user.id;

for (const todo of await listTodos(userId)) await deleteTodo(userId, todo.id);

for (const todo of TODOS) {
  const added = await addTodo(
    userId,
    {
      title: todo.title,
      dueDate: todo.due === undefined ? null : isoDay(todo.due),
    },
    daysFromToday(-todo.created, 9),
  );
  if (todo.done !== undefined) {
    await updateTodo(
      userId,
      added.id,
      { done: true },
      daysFromToday(-todo.done, 18),
    );
  }
}

console.log(
  `Seeded ${TODOS.length} todos for ${DEMO.email} (password: ${DEMO.password})`,
);
