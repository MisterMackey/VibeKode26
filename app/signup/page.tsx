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

export default function SignUpPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const { error: signUpError } = await authClient.signUp.email({
      name: String(formData.get("name")),
      email: String(formData.get("email")),
      password: String(formData.get("password")),
    });

    setPending(false);
    if (signUpError) {
      setError(signUpError.message ?? "Could not sign up.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <AuthCard title="Sign up">
      <form onSubmit={handleSubmit}>
        <FormError message={error} />
        <FormField
          label="Name"
          name="name"
          type="text"
          required
          autoComplete="name"
        />
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
          autoComplete="new-password"
          minLength={8}
        />
        <SubmitButton pending={pending}>Sign up</SubmitButton>
      </form>
      <FormFooter>
        Already have an account? <FooterLink href="/login">Log in</FooterLink>
      </FormFooter>
    </AuthCard>
  );
}
