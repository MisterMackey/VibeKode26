import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { db } from "@/lib/db";
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
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
          Welcome, {currentUser?.name}
        </h1>
        <SignOutButton />
      </div>
    </div>
  );
}
