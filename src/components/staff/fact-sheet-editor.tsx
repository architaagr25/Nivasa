"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Loader2,
  Minus,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  diffFacts,
  factSheetWarnings,
  type Category,
  type Fact,
} from "@/lib/fact-sheet-checks";
import { cn } from "@/lib/utils";
import {
  discardFactSheetDraft,
  publishFactSheet,
  saveFactSheetDraft,
} from "@/server/admin/actions";

type Row = { key: number; code: string | null; category: Category; label: string; value: string };
let nextKey = 1;
const toRow = (f: Fact): Row => ({ key: nextKey++, ...f });

export function FactSheetEditor({
  projectId,
  version,
  draft,
  live,
  changeNote: initialNote,
}: {
  projectId: string;
  version: number;
  draft: Fact[];
  live: Fact[];
  changeNote: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [rows, setRows] = useState<Row[]>(() => draft.map(toRow));
  const [note, setNote] = useState(initialNote);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"save" | "publish" | "discard" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const edit = (fn: (rows: Row[]) => Row[]) => {
    setRows(fn);
    setDirty(true);
  };
  const update = (key: number, patch: Partial<Row>) =>
    edit((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (i: number, by: -1 | 1) =>
    edit((rs) => {
      const next = [...rs];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });

  // A new fact has no code until it's saved, so the diff shows it as added under a placeholder.
  const asFacts = useMemo(
    () => rows.map((r) => ({ ...r, code: r.code ?? `new-${r.key}` })),
    [rows],
  );
  const changes = useMemo(() => diffFacts(live, asFacts), [live, asFacts]);
  const warnings = useMemo(() => factSheetWarnings(rows), [rows]);

  const save = async () => {
    const res = await saveFactSheetDraft(projectId, {
      facts: rows.map(({ code, category, label, value }) => ({ code, category, label, value })),
      changeNote: note,
    });
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    // New facts now have their citation codes; keep them so the next save doesn't mint more.
    setRows((rs) => rs.map((r, i) => ({ ...r, code: res.codes[i] ?? r.code })));
    setDirty(false);
    return true;
  };

  const run = (kind: "save" | "publish" | "discard", fn: () => Promise<void>) =>
    start(async () => {
      setBusy(kind);
      setError(null);
      await fn();
      setBusy(null);
    });

  const disabled = pending || !hydrated;

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.key} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={r.category}
                onChange={(e) => update(r.key, { category: e.target.value as Category })}
                aria-label="Section"
                className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
              <Input
                value={r.label}
                onChange={(e) => update(r.key, { label: e.target.value })}
                aria-label="Label"
                placeholder="Label, e.g. 2 BHK starting price"
                maxLength={80}
                className="h-9 min-w-0 flex-1 basis-48 font-medium"
              />
              <div className="ml-auto flex items-center">
                <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </IconButton>
                <IconButton
                  label="Move down"
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown />
                </IconButton>
                <IconButton
                  label={`Remove ${r.label || "this fact"}`}
                  onClick={() => edit((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Trash2 />
                </IconButton>
              </div>
            </div>
            <textarea
              value={r.value}
              onChange={(e) => update(r.key, { value: e.target.value })}
              aria-label={`${r.label || "Fact"} text`}
              rows={Math.min(6, Math.max(2, Math.ceil(r.value.length / 90)))}
              maxLength={600}
              className="mt-2 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-relaxed focus-visible:border-ring focus-visible:outline-none"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {r.code ? (
                <>
                  Cited as <code className="font-mono">{r.code}</code>
                </>
              ) : (
                "New fact: gets its citation code when saved"
              )}
            </p>
          </li>
        ))}
      </ol>

      <Button
        variant="outline"
        size="lg"
        onClick={() =>
          edit((rs) => [
            ...rs,
            { key: nextKey++, code: null, category: "overview", label: "", value: "" },
          ])
        }
      >
        <Plus data-icon="inline-start" /> Add a fact
      </Button>

      {warnings.length > 0 && (
        <ul className="space-y-1.5 rounded-2xl bg-ochre-soft p-4 text-sm">
          {warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
            </li>
          ))}
        </ul>
      )}

      {/* Stays in view while scrolling a long sheet, above the phone tab bar. */}
      <div className="sticky bottom-16 z-20 space-y-2 rounded-2xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur md:bottom-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setDirty(true);
            }}
            maxLength={200}
            placeholder="What changed, e.g. Possession moved to March 2029"
            aria-label="Change note"
            className="h-10 min-w-0 flex-1 basis-64"
          />
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {dirty ? "Unsaved changes" : "Draft saved"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            onClick={() =>
              run("save", async () => {
                if (await save()) setReviewing(true);
              })
            }
            disabled={disabled || !changes.length}
          >
            {busy === "save" ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Send data-icon="inline-start" />
            )}
            Review and publish
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => run("save", async () => void (await save()))}
            disabled={disabled || !dirty}
          >
            <Save data-icon="inline-start" /> Save draft
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setDiscarding(true)}
            disabled={disabled}
          >
            Discard draft
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <AlertDialog open={reviewing} onOpenChange={setReviewing}>
        <AlertDialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Publish version {version}?</AlertDialogTitle>
            <AlertDialogDescription>
              The project page and the assistant switch to this version straight away. The current
              version is archived, so past chats can still be checked against it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-2 text-sm">
            {changes.map((c) => (
              <li key={`${c.kind}-${c.fact.code}`} className="rounded-xl bg-secondary/60 p-3">
                <p className="flex items-center gap-1.5 font-medium">
                  {c.kind === "added" ? (
                    <Plus className="size-3.5 text-accent-foreground" aria-hidden />
                  ) : c.kind === "removed" ? (
                    <Minus className="size-3.5 text-destructive" aria-hidden />
                  ) : (
                    <span className="size-1.5 rounded-full bg-ochre" aria-hidden />
                  )}
                  {c.kind === "added" ? "New" : c.kind === "removed" ? "Removed" : "Changed"}:{" "}
                  {c.fact.label}
                </p>
                {c.kind === "changed" && c.before.value !== c.fact.value ? (
                  <div className="mt-1 space-y-1">
                    <p className="text-muted-foreground line-through decoration-destructive/60">
                      {c.before.value}
                    </p>
                    <p>{c.fact.value}</p>
                  </div>
                ) : (
                  <p
                    className={cn(
                      "mt-1",
                      c.kind === "removed" && "text-muted-foreground line-through",
                    )}
                  >
                    {c.fact.value}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {warnings.length > 0 && (
            <p className="flex gap-2 rounded-xl bg-ochre-soft p-3 text-sm">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {warnings.length === 1 ? "One thing" : `${warnings.length} things`} worth a second
              look, listed under the sheet.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                run("publish", async () => {
                  const res = await publishFactSheet(projectId);
                  if (!res.ok) {
                    setError(res.error);
                    setReviewing(false);
                    return;
                  }
                  setReviewing(false);
                  router.replace(`/staff/admin?project=${projectId}&published=${res.version}`);
                  router.refresh();
                });
              }}
            >
              {busy === "publish" && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Publish version {version}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits are thrown away. The published version stays exactly as it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the draft</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                run("discard", async () => {
                  const res = await discardFactSheetDraft(projectId);
                  setDiscarding(false);
                  if (!res.ok) setError(res.error);
                  else router.refresh();
                });
              }}
            >
              Discard draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
