"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePenLine, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { startFactSheetDraft } from "@/server/admin/actions";

export function StartDraftButton({ projectId, next }: { projectId: string; next: number }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        size="lg"
        disabled={pending || !hydrated}
        onClick={() =>
          start(async () => {
            const res = await startFactSheetDraft(projectId);
            if (!res.ok) setError(res.error);
            else router.replace(`/staff/admin?project=${projectId}`);
            router.refresh();
          })
        }
      >
        {pending ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : (
          <FilePenLine data-icon="inline-start" />
        )}
        Edit as version {next}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
