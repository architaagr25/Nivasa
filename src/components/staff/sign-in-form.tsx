"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";

type Demo = { password: string; accounts: { email: string; name: string; role: string }[] };

export function StaffSignInForm({ notice, demo }: { notice: string | null; demo: Demo | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice);
  const hydrated = useHydrated();

  // Values are read from the form itself, so anything typed before the page finished
  // loading still counts.
  async function signIn(e: string, p: string) {
    setBusy(true);
    setError(null);
    const res = await authClient.signIn.email({ email: e, password: p });
    if (res.error) {
      setBusy(false);
      setError(
        res.error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "That email and password don't match.",
      );
      return;
    }
    router.replace("/staff/leads");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form
        className="space-y-4 rounded-2xl border border-border bg-card p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          signIn(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            name="email"
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            name="password"
            className="h-11"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="xl" className="w-full" disabled={busy || !hydrated}>
          {busy && <Loader2 className="animate-spin" data-icon="inline-start" />}
          Sign in
        </Button>
      </form>

      {demo && (
        <div className="space-y-3 rounded-2xl bg-ochre-soft p-5 text-sm">
          <p className="font-medium">Demo accounts</p>
          <p className="text-muted-foreground">
            Password for all: <code className="font-mono text-foreground">{demo.password}</code>
          </p>
          <ul className="space-y-2">
            {demo.accounts.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  disabled={busy || !hydrated}
                  onClick={() => signIn(a.email, demo.password)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 text-left transition-colors hover:bg-secondary disabled:opacity-60"
                >
                  <span>
                    <span className="block font-medium">{a.name}</span>
                    <span className="block text-xs text-muted-foreground">{a.role}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">Sign in →</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
