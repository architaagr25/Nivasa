"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { checkInVisit } from "@/server/staff/actions";

export function CheckInButton({ token, name }: { token: string; name: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        size="xl"
        className="w-full"
        disabled={pending || !hydrated}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await checkInVisit(token);
            if (!res.ok) setError(res.error);
            else router.refresh();
          })
        }
      >
        {pending ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : (
          <UserCheck data-icon="inline-start" />
        )}
        {name} has arrived
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
