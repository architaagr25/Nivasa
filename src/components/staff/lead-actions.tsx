"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { claimLead, markVisit, reassignLead, setLeadClosed } from "@/server/staff/actions";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That didn't work.");
      else router.refresh();
    });
  return { pending, error, run };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

export function ClaimButton({ code }: { code: string }) {
  const { pending, error, run } = useAction();
  return (
    <div className="space-y-1">
      <Button size="lg" disabled={pending} onClick={() => run(() => claimLead(code))}>
        {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
        Take this lead
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}

export function ReassignSelect({
  code,
  current,
  team,
}: {
  code: string;
  current: string | null;
  team: { userId: string; name: string }[];
}) {
  const { pending, error, run } = useAction();
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Owner</span>
        <select
          className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
          value={current ?? ""}
          disabled={pending}
          onChange={(e) => e.target.value && run(() => reassignLead(code, e.target.value))}
        >
          {!current && <option value="">Unassigned</option>}
          {team.map((t) => (
            <option key={t.userId} value={t.userId}>
              {t.name}
            </option>
          ))}
        </select>
        {pending && <Loader2 className="size-4 animate-spin" aria-label="Saving" />}
      </label>
      <ErrorLine error={error} />
    </div>
  );
}

export function CloseLeadButton({ code, closed }: { code: string; closed: boolean }) {
  const { pending, error, run } = useAction();
  return (
    <div className="space-y-1">
      <Button
        variant="ghost"
        size="lg"
        disabled={pending}
        onClick={() => run(() => setLeadClosed(code, !closed))}
      >
        {closed ? "Reopen lead" : "Close as not interested"}
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}

export function VisitOutcome({ code }: { code: string }) {
  const { pending, error, run } = useAction();
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => markVisit(code, "visited"))}>
          Visited
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => markVisit(code, "no_show"))}
        >
          No-show
        </Button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}
