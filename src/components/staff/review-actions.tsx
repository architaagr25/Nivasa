"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Merge, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHydrated } from "@/hooks/use-hydrated";
import { dismissDuplicate, mergeDuplicate, reviewFlag } from "@/server/staff/actions";

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

/** Close a flag, with an optional note on what was done about it. */
export function ReviewFlagForm({ flagId }: { flagId: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const note = useRef<HTMLInputElement>(null);

  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await reviewFlag(flagId, note.current?.value ?? "");
          if (!res.ok) setError(res.error);
          else router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Input
          ref={note}
          name="note"
          maxLength={300}
          placeholder="What was done (optional)"
          aria-label="Review note"
          className="h-10 min-w-0 flex-1 basis-56"
        />
        <Button type="submit" size="lg" variant="outline" disabled={pending || !hydrated}>
          {pending ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <Check data-icon="inline-start" />
          )}
          Mark reviewed
        </Button>
      </div>
      <ErrorLine error={error} />
    </form>
  );
}

export function DuplicateActions({
  candidateId,
  keepCode,
  dropCode,
}: {
  candidateId: string;
  keepCode: string;
  dropCode: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"merge" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (kind: "merge" | "dismiss") =>
    start(async () => {
      setBusy(kind);
      setError(null);
      const res =
        kind === "merge" ? await mergeDuplicate(candidateId) : await dismissDuplicate(candidateId);
      setBusy(null);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="lg" disabled={pending || !hydrated}>
              {busy === "merge" ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Merge data-icon="inline-start" />
              )}
              Same person, merge
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Merge {dropCode} into {keepCode}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {keepCode} came in first, so it stays. It takes over {dropCode}&apos;s enquiries,
                chats, visits and messages, and fills in anything it&apos;s missing. If either lead
                opted out of messages, the merged lead stays opted out. This can&apos;t be undone
                from here.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Not yet</AlertDialogCancel>
              <AlertDialogAction onClick={() => run("merge")}>Merge leads</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button
          size="lg"
          variant="outline"
          disabled={pending || !hydrated}
          onClick={() => run("dismiss")}
        >
          {busy === "dismiss" ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <X data-icon="inline-start" />
          )}
          Different people
        </Button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}
