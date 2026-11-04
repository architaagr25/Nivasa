"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarX2, ChevronDown, Copy, Loader2, Plus, Save, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import { addBlackout, removeBlackout, saveSlotTemplates } from "@/server/admin/actions";

type Time = { startTime: string; durationMin: number; capacity: number };
type Affected = { code: string; startsAt: Date; leadCode: string; buyerName: string | null };
type Summary = { added: number; removed: number; closed: number; affected: Affected[] };

// Monday first, the way the site team plans its week; values are JS weekdays (0 = Sunday).
const WEEK = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [0, "Sunday"],
] as const;

const when = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(d));

const clock = (hhmm: string) =>
  new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(`2000-01-01T${hhmm}:00Z`),
  );

/** What a save did to the next eight weeks, and any booked visits that now need moving. */
function SyncResult({ r }: { r: Summary }) {
  const parts = [
    r.added && `${r.added} slot${r.added > 1 ? "s" : ""} opened`,
    r.removed && `${r.removed} removed`,
    r.closed && `${r.closed} closed to new bookings`,
  ].filter(Boolean);
  return (
    <div
      role="status"
      className={cn(
        "space-y-2 rounded-xl px-4 py-3 text-sm",
        r.affected.length ? "bg-ochre-soft" : "bg-sage-soft",
      )}
    >
      <p>
        Saved.{" "}
        {parts.length
          ? `${parts.join(", ")} over the next eight weeks.`
          : "No slots needed to change."}
      </p>
      {r.affected.length > 0 && (
        <>
          <p className="font-medium">
            {r.affected.length} booked visit{r.affected.length > 1 ? "s are" : " is"} at a time
            that&apos;s no longer offered. They haven&apos;t been cancelled; move them with the
            buyer:
          </p>
          <ul className="space-y-1">
            {r.affected.map((v) => (
              <li key={v.code}>
                <Link href={`/staff/leads/${v.leadCode}`} className="underline underline-offset-4">
                  {v.buyerName ?? v.leadCode}
                </Link>{" "}
                · {when(v.startsAt)} · {v.code}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function SlotTemplateEditor({
  projectId,
  initial,
}: {
  projectId: string;
  initial: Record<number, Time[]>;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [days, setDays] = useState<Record<number, Time[]>>(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());

  const change = (fn: (d: Record<number, Time[]>) => Record<number, Time[]>) => {
    setDays(fn);
    setDirty(true);
    setResult(null);
  };
  const setTime = (day: number, i: number, patch: Partial<Time>) =>
    change((d) => ({ ...d, [day]: d[day].map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const addTime = (day: number) =>
    change((d) => {
      const list = d[day] ?? [];
      const last = list.at(-1)?.startTime ?? "09:00";
      const next = `${String(Math.min(19, Number(last.slice(0, 2)) + 1)).padStart(2, "0")}:00`;
      return { ...d, [day]: [...list, { startTime: next, durationMin: 60, capacity: 2 }] };
    });
  const copyToAll = (day: number) =>
    change((d) => Object.fromEntries(WEEK.map(([w]) => [w, d[day].map((t) => ({ ...t }))])));

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveSlotTemplates(
        projectId,
        WEEK.flatMap(([w]) => (days[w] ?? []).map((t) => ({ ...t, weekday: w }))),
      );
      if (!res.ok) return setError(res.error);
      setResult(res);
      setDirty(false);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
        {WEEK.map(([w, name]) => {
          const list = days[w] ?? [];
          return (
            <li key={w} className="grid gap-3 p-4 md:grid-cols-[8rem_minmax(0,1fr)]">
              {/* On phones each day folds to one line; the desktop shows the whole week. */}
              <button
                type="button"
                onClick={() =>
                  setOpen((o) => {
                    const next = new Set(o);
                    if (!next.delete(w)) next.add(w);
                    return next;
                  })
                }
                aria-expanded={open.has(w)}
                className="flex items-center justify-between gap-3 text-left md:pointer-events-none md:block"
              >
                <span className="block font-medium">{name}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {list.length
                    ? `${list.length} time${list.length > 1 ? "s" : ""} · ${list.reduce((a, t) => a + t.capacity, 0)} visits`
                    : "Closed"}
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform md:hidden",
                      open.has(w) && "rotate-180",
                    )}
                    aria-hidden
                  />
                </span>
              </button>
              <div
                className={cn(
                  "flex-wrap items-center gap-2 md:flex",
                  open.has(w) ? "flex" : "hidden",
                )}
              >
                {list.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 rounded-xl border border-border bg-background py-1 pr-1 pl-2 text-sm"
                  >
                    <input
                      type="time"
                      value={t.startTime}
                      step={900}
                      onChange={(e) => setTime(w, i, { startTime: e.target.value })}
                      aria-label={`${name} start time ${i + 1}`}
                      className="tabular w-[6.5rem] bg-transparent"
                    />
                    <span className="text-muted-foreground" aria-hidden>
                      ·
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={t.capacity}
                      onChange={(e) => setTime(w, i, { capacity: Number(e.target.value) })}
                      aria-label={`${name} ${clock(t.startTime)} visits at once`}
                      className="tabular w-10 bg-transparent text-right"
                    />
                    <span className="text-muted-foreground">at once</span>
                    <button
                      type="button"
                      onClick={() => change((d) => ({ ...d, [w]: d[w].filter((_, j) => j !== i) }))}
                      aria-label={`Remove ${name} ${clock(t.startTime)}`}
                      className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addTime(w)}
                  className="flex min-h-10 items-center gap-1 rounded-xl border border-dashed border-border px-3 text-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                >
                  <Plus className="size-4" aria-hidden /> Add a time
                </button>
                {list.length > 0 && (
                  <button
                    type="button"
                    onClick={() => copyToAll(w)}
                    className="flex min-h-10 items-center gap-1 rounded-xl px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="size-3.5" aria-hidden /> Same every day
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Each visit lasts an hour. Changes apply from tomorrow; today&apos;s visits stay as they are.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" onClick={save} disabled={pending || !hydrated || !dirty}>
          {pending ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <Save data-icon="inline-start" />
          )}
          Save visiting times
        </Button>
        {dirty && (
          <Button
            size="lg"
            variant="ghost"
            onClick={() => {
              setDays(initial);
              setDirty(false);
            }}
          >
            <Undo2 data-icon="inline-start" /> Undo changes
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && <SyncResult r={result} />}
    </div>
  );
}

export function ClosedDays({
  projectId,
  projectName,
  days,
  minDate,
}: {
  projectId: string;
  projectName: string;
  days: { id: string; date: string; reason: string; projectId: string | null }[];
  minDate: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  const label = (d: string) =>
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(`${d}T00:00:00Z`));

  return (
    <div className="space-y-4">
      <form
        ref={form}
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          start(async () => {
            setError(null);
            setResult(null);
            const res = await addBlackout({
              projectId: f.get("scope") === "all" ? null : projectId,
              date: String(f.get("date") ?? ""),
              reason: String(f.get("reason") ?? ""),
            });
            if (!res.ok) return setError(res.error);
            setResult(res);
            form.current?.reset();
            router.refresh();
          });
        }}
      >
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-muted-foreground">Date</span>
          <Input type="date" name="date" min={minDate} required className="h-10 w-40" />
        </label>
        <label className="min-w-0 flex-1 basis-48 space-y-1 text-sm">
          <span className="block text-xs text-muted-foreground">Reason</span>
          <Input
            name="reason"
            required
            maxLength={80}
            placeholder="e.g. Uttarayan"
            className="h-10"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-muted-foreground">Closed for</span>
          <select name="scope" className="h-10 rounded-lg border border-input bg-card px-2">
            <option value="project">{projectName} only</option>
            <option value="all">Both projects</option>
          </select>
        </label>
        <Button type="submit" size="lg" disabled={pending || !hydrated}>
          {pending && !removing ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <CalendarX2 data-icon="inline-start" />
          )}
          Close this day
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && <SyncResult r={result} />}

      {days.length ? (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {days.map((d) => (
            <li
              key={d.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_auto_auto]"
            >
              <span className="tabular font-medium">{label(d.date)}</span>
              <span className="col-start-1 row-start-2 min-w-0 sm:col-start-auto sm:row-start-auto">
                {d.reason}
                <span className="text-xs text-muted-foreground sm:hidden">
                  {" "}
                  · {d.projectId ? projectName : "Both projects"}
                </span>
              </span>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {d.projectId ? projectName : "Both projects"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending || !hydrated}
                onClick={() =>
                  start(async () => {
                    setRemoving(d.id);
                    setError(null);
                    const res = await removeBlackout(d.id);
                    setRemoving(null);
                    if (!res.ok) return setError(res.error);
                    setResult(res);
                    router.refresh();
                  })
                }
              >
                {removing === d.id && <Loader2 className="animate-spin" data-icon="inline-start" />}
                Reopen
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
          No closed days coming up.
        </p>
      )}
    </div>
  );
}
