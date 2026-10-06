import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LissieChat } from "@/components/lissie-chat";
import { SignOutButton } from "@/components/sign-out-button";
import { db } from "@/lib/db";
import { lissieThreadId } from "@/lib/lissie";
import { user as userTable } from "@/lib/schema";
import { getUserId } from "@/lib/session";

export default async function Home() {
  const userId = await getUserId(await headers());
  if (!userId) redirect("/login");

  const [currentUser] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId));

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between border-b border-black/[.08] bg-white px-4 py-3 dark:border-white/[.145] dark:bg-zinc-900">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
            Lissie
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            keeping {currentUser?.name}'s list
          </p>
        </div>
        <SignOutButton />
      </header>
      <main className="min-h-0 flex-1">
        <LissieChat threadId={lissieThreadId(userId)} />
      </main>
    </div>
  );
}
