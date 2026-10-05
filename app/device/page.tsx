import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DeviceApproval } from "@/components/device-approval";
import { getUserId } from "@/lib/session";

// Where a signed-in user approves a `todo-cat login` device code. The CLI
// prints this URL, optionally with ?user_code= filled in.
export default async function DevicePage({
  searchParams,
}: PageProps<"/device">) {
  const { user_code } = await searchParams;
  const userCode = typeof user_code === "string" ? user_code : "";

  if (!(await getUserId(await headers()))) {
    const back = userCode
      ? `/device?user_code=${encodeURIComponent(userCode)}`
      : "/device";
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  return <DeviceApproval initialCode={userCode} />;
}
