"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import {
  AuthCard,
  FooterLink,
  FormError,
  FormField,
  FormFooter,
  SubmitButton,
} from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";

// Where to go after logging in: `?next=` (set by /device), if it is a path on
// this site. Anything else, like `//evil.example`, falls back to the home page.
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next?.startsWith("/") && !/^\/[/\\]/.test(next) ? next : "/";
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const { error: signInError } = await authClient.signIn.email({
      email: String(formData.get("email")),
      password: String(formData.get("password")),
    });

    setPending(false);
    if (signInError) {
      setError(signInError.message ?? "Could not log in.");
      return;
    }
    router.push(nextPath());
    router.refresh();
  }

  return (
    <AuthCard title="Log in">
      <form onSubmit={handleSubmit}>
        <FormError message={error} />
        <FormField
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
        <SubmitButton pending={pending}>Log in</SubmitButton>
      </form>
      <FormFooter>
        Need an account? <FooterLink href="/signup">Sign up</FooterLink>
      </FormFooter>
    </AuthCard>
  );
}
