"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import {
  AuthCard,
  FormError,
  FormField,
  FormFooter,
  SubmitButton,
} from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";

type Step =
  | { name: "enter" }
  | { name: "review"; userCode: string }
  | { name: "finished"; message: string };

// Enter the code, check it against the terminal, approve or deny. Looking the
// code up while signed in claims it for this user, which Better Auth requires
// before approving.
export function DeviceApproval({ initialCode }: { initialCode: string }) {
  const [step, setStep] = useState<Step>({ name: "enter" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function lookUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const userCode = String(new FormData(event.currentTarget).get("code"))
      .trim()
      .toUpperCase();
    const { data, error: lookUpError } = await authClient.device({
      query: { user_code: userCode },
    });
    setPending(false);
    if (lookUpError || !data) {
      setError("Unknown or expired code. Run `todo-cat login` again.");
    } else if (data.status !== "pending") {
      setError("This code has already been used.");
    } else {
      setStep({ name: "review", userCode });
    }
  }

  async function decide(userCode: string, approve: boolean) {
    setError(null);
    setPending(true);
    const { error: decideError } = approve
      ? await authClient.device.approve({ userCode })
      : await authClient.device.deny({ userCode });
    setPending(false);
    if (decideError) {
      setError(decideError.error_description || "Could not process the code.");
      return;
    }
    setStep({
      name: "finished",
      message: approve
        ? "Device approved. You can go back to your terminal."
        : "Request denied. The terminal will not be signed in.",
    });
  }

  if (step.name === "finished") {
    return (
      <AuthCard title="Connect a device">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          {step.message}
        </p>
      </AuthCard>
    );
  }

  if (step.name === "review") {
    return (
      <AuthCard title="Connect a device">
        <FormError message={error} />
        <p className="mb-4 text-sm text-zinc-700 dark:text-zinc-300">
          The todo-cat CLI wants to access your todos. Approve only if your
          terminal shows this code:
        </p>
        <p className="mb-6 text-center font-mono text-2xl font-semibold tracking-widest text-black dark:text-zinc-50">
          {step.userCode}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            decide(step.userCode, true);
          }}
        >
          <SubmitButton pending={pending}>Approve</SubmitButton>
        </form>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide(step.userCode, false)}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-full border border-black/[.08] px-5 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Deny
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Connect a device">
      <form onSubmit={lookUp}>
        <FormError message={error} />
        <FormField
          label="Code shown in your terminal"
          name="code"
          type="text"
          required
          autoComplete="off"
          defaultValue={initialCode}
        />
        <SubmitButton pending={pending}>Continue</SubmitButton>
      </form>
      <FormFooter>
        Run <code>todo-cat login</code> to get a code.
      </FormFooter>
    </AuthCard>
  );
}
