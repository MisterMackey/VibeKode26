import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function AuthCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-sm rounded-xl border border-black/[.08] bg-white p-8 shadow-sm dark:border-white/[.145] dark:bg-zinc-900">
        <h1 className="mb-6 text-2xl font-semibold text-black dark:text-zinc-50">
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}

export function FormField({
  label,
  ...props
}: { label: string } & ComponentProps<"input">) {
  return (
    <label className="mb-4 block text-sm">
      <span className="mb-1.5 block font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      <input
        {...props}
        className="w-full rounded-lg border border-black/[.08] bg-white px-3 py-2 text-black outline-none transition-colors focus:border-zinc-950 dark:border-white/[.145] dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-50"
      />
    </label>
  );
}

export function SubmitButton({
  children,
  pending,
}: {
  children: ReactNode;
  pending?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-11 w-full items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-[#ccc]"
    >
      {pending ? "..." : children}
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
      {message}
    </p>
  );
}

export function FormFooter({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
      {children}
    </p>
  );
}

export function FooterLink(props: ComponentProps<typeof Link>) {
  return (
    <Link {...props} className="font-medium text-zinc-950 dark:text-zinc-50" />
  );
}
