import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { VisitOutcome } from "@/components/staff/lead-actions";
import { requireStaff, type StaffViewer } from "@/lib/session";
import { timeOfDay } from "@/lib/staff-format";
import { addDays, istDate, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { EARLY_CHECKIN_MS } from "@/server/bookings/service";
import { visitCalendar, type CalendarSlot, type CalendarVisit } from "@/server/staff/visits";

export const metadata: Metadata = { title: "Visits" };

type View = "day" | "week";

export default function VisitsPage(props: PageProps<"/staff/visits">) {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <Suspense fallback={<CalendarSkeleton />}>
        <Calendar {...props} />
      </Suspense>
    </div>
  );
}

const longDate = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...opts }).format(
    new Date(`${date}T00:00:00Z`),
  );

async function Calendar({ searchParams }: PageProps<"/staff/visits">) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const now = new Date();
  const today = istDate(now);
  const view: View = sp.view === "week" ? "week" : "day";
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const project = sp.project === "project-1" || sp.project === "project-2" ? sp.project : null;

  // Weeks run Monday to Sunday.
  const weekStart = addDays(date, -((weekdayOf(date) + 6) % 7));
  const from = view === "day" ? date : weekStart;
  const to = view === "day" ? date : addDays(weekStart, 6);
  const data = await visitCalendar(viewer, from, to, project);

  const href = (next: Partial<{ view: View; date: string; project: string | null }>) => {
    const merged = { view, date, project, ...next };
    const q = new URLSearchParams();
    if (merged.view !== "day") q.set("view", merged.view);
    if (merged.date !== today) q.set("date", merged.date);
    if (merged.project) q.set("project", merged.project);
    return `/staff/visits${q.size ? `?${q}` : ""}`;
  };
  const step = view === "day" ? 1 : 7;
  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-9 items-center rounded-full border px-3.5 py-1.5 text-sm",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card hover:border-foreground/40",
    );

  const counts = {
    upcoming: data.visits.filter((v) => v.status === "booked" && v.startsAt > now).length,
    visited: data.visits.filter((v) => v.status === "visited").length,
    missed: data.visits.filter((v) => v.status === "no_show").length,
    pending: data.visits.filter((v) => outcomeDue(v, now)).length,
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light">Visits</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {viewer.role === "sales_head"
              ? "Every site visit, by slot."
              : "Visits you're meeting and visits for your leads. Slot fill shows everyone's bookings."}
          </p>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Filters">
          {(["day", "week"] as const).map((v) => (
            <Link
              key={v}
              href={href({ view: v })}
              className={chip(view === v)}
              aria-current={view === v ? "page" : undefined}
            >
              {v === "day" ? "Day" : "Week"}
            </Link>
          ))}
          {/* An executive on one project has nothing to filter. */}
          {(viewer.role === "sales_head" || viewer.projectIds.length !== 1) && (
            <>
              <span className="mx-1 w-px self-stretch bg-border" aria-hidden />
              {[null, "project-1", "project-2"].map((pr) => (
                <Link
                  key={pr ?? "both"}
                  href={href({ project: pr })}
                  className={chip(project === pr)}
                  aria-current={project === pr ? "page" : undefined}
                >
                  {pr ? data.projectNames[pr] : "Both projects"}
                </Link>
              ))}
            </>
          )}
        </nav>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-2 pl-4">
        <h2 className="text-lg font-normal">
          {view === "day"
            ? longDate(date, { weekday: "long", day: "numeric", month: "long" })
            : `${longDate(from, { day: "numeric", month: "short" })} – ${longDate(to, { day: "numeric", month: "short" })}`}
          {view === "day" && date === today && (
            <span className="ml-2 text-sm text-muted-foreground">Today</span>
          )}
        </h2>
        <div className="flex items-center gap-1">
          <Link
            href={href({ date: addDays(date, -step) })}
            className="grid size-10 place-items-center rounded-full hover:bg-secondary"
            aria-label={view === "day" ? "Previous day" : "Previous week"}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <Link
            href={href({ date: today })}
            className="min-h-10 rounded-full px-3 py-2 text-sm hover:bg-secondary"
          >
            Today
          </Link>
          <Link
            href={href({ date: addDays(date, step) })}
            className="grid size-10 place-items-center rounded-full hover:bg-secondary"
            aria-label={view === "day" ? "Next day" : "Next week"}
          >
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Summary">
        <Count n={counts.upcoming} label="coming up" dot="bg-ochre" />
        <Count n={counts.visited} label="visited" dot="bg-sage" />
        <Count n={counts.missed} label="missed" dot="bg-clay" />
        {counts.pending > 0 && (
          <Count n={counts.pending} label="need an outcome" dot="bg-destructive" strong />
        )}
      </ul>

      {view === "day" ? (
        <DayView
          slots={data.slots}
          visits={data.visits}
          projectNames={data.projectNames}
          viewer={viewer}
          now={now}
          showProject={!project}
        />
      ) : (
        <WeekView
          days={Array.from({ length: 7 }, (_, i) => addDays(from, i))}
          slots={data.slots}
          visits={data.visits}
          today={today}
          now={now}
          dayHref={(d) => href({ view: "day", date: d })}
        />
      )}
    </>
  );
}

/** A visit whose time has passed with nobody recording what happened. */
function outcomeDue(v: CalendarVisit, now: Date) {
  return v.status === "booked" && v.startsAt <= now;
}

function Count({
  n,
  label,
  dot,
  strong,
}: {
  n: number;
  label: string;
  dot: string;
  strong?: boolean;
}) {
  return (
    <li className={cn("flex items-center gap-2", strong && "font-medium text-destructive")}>
      <span className={cn("size-2 rounded-full", dot)} aria-hidden />
      <span className="tabular">{n}</span> {label}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Day                                                                */
/* ------------------------------------------------------------------ */

function DayView({
  slots,
  visits,
  projectNames,
  viewer,
  now,
  showProject,
}: {
  slots: CalendarSlot[];
  visits: CalendarVisit[];
  projectNames: Record<string, string>;
  viewer: StaffViewer;
  now: Date;
  showProject: boolean;
}) {
  if (!slots.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-5 py-12 text-center text-muted-foreground">
        No visit slots on this day. The site may be closed, or slots haven&apos;t been opened yet.
      </p>
    );
  }
  // One row per start time, holding that time's slot on each project.
  const times = [...new Set(slots.map((s) => s.startsAt.getTime()))];
  const byId = Map.groupBy(visits, (v) => v.slotId);

  return (
    <ol className="space-y-3">
      {times.map((t) => {
        const atTime = slots.filter((s) => s.startsAt.getTime() === t);
        const start = new Date(t);
        const live = start <= now && now < atTime[0].endsAt;
        return (
          <li
            key={t}
            className="grid gap-3 sm:grid-cols-[6rem_minmax(0,1fr)]"
            aria-current={live ? "time" : undefined}
          >
            <div className="flex items-baseline gap-2 sm:block sm:pt-4">
              <p className={cn("tabular text-sm", live ? "font-medium" : "text-muted-foreground")}>
                {timeOfDay(start)}
              </p>
              {live && (
                <p className="text-xs font-medium text-accent-foreground">
                  <span className="mr-1 inline-block size-1.5 rounded-full bg-sage" aria-hidden />
                  Now
                </p>
              )}
            </div>
            <div className={cn("grid gap-3", atTime.length > 1 && "lg:grid-cols-2")}>
              {atTime.map((slot) => (
                <SlotCard
                  key={slot.id}
                  slot={slot}
                  visits={byId.get(slot.id) ?? []}
                  projectName={showProject ? projectNames[slot.projectId] : null}
                  viewer={viewer}
                  now={now}
                  live={live}
                />
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SlotCard({
  slot,
  visits,
  projectName,
  viewer,
  now,
  live,
}: {
  slot: CalendarSlot;
  visits: CalendarVisit[];
  projectName: string | null;
  viewer: StaffViewer;
  now: Date;
  live: boolean;
}) {
  // Places taken by other executives' buyers: counted, not named.
  const others = Math.max(0, slot.booked - visits.filter((v) => v.status === "booked").length);
  const past = slot.endsAt <= now;
  return (
    <section
      className={cn(
        "rounded-2xl border bg-card p-4",
        live ? "border-sage ring-1 ring-sage" : "border-border",
        past && !visits.length && "opacity-60",
      )}
      aria-label={`${projectName ?? "Slot"} at ${timeOfDay(slot.startsAt)}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{projectName}</span>
        {slot.blocked ? (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">Blocked</span>
        ) : (
          <Fill booked={slot.booked} capacity={slot.capacity} />
        )}
      </div>
      {visits.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {visits.map((v) => (
            <VisitRow key={v.code} v={v} viewer={viewer} now={now} />
          ))}
        </ul>
      )}
      {others > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {others} more booked with {others > 1 ? "other executives" : "another executive"}
        </p>
      )}
      {!visits.length && !others && !slot.blocked && (
        <p className="mt-2 text-sm text-muted-foreground">{past ? "No bookings" : "Open"}</p>
      )}
    </section>
  );
}

function Fill({ booked, capacity }: { booked: number; capacity: number }) {
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: capacity }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 w-3 rounded-sm",
              i < booked ? "bg-primary" : "border border-border bg-background",
            )}
          />
        ))}
      </span>
      <span className="tabular">
        {booked} of {capacity} booked
      </span>
    </span>
  );
}

function VisitRow({ v, viewer, now }: { v: CalendarVisit; viewer: StaffViewer; now: Date }) {
  const canRecord = viewer.role === "sales_head" || v.mine;
  const due = outcomeDue(v, now);
  const open = v.status === "booked" && v.startsAt.getTime() - now.getTime() <= EARLY_CHECKIN_MS;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <Link
            href={`/staff/leads/${v.leadCode}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {v.buyerName ?? v.leadCode}
          </Link>
          <span className="tabular text-xs text-muted-foreground">{v.code}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {[v.wantsBhk, `with ${v.mine ? "you" : (v.executiveName ?? "—")}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <VisitStatus v={v} due={due} />
        {open && canRecord && <VisitOutcome code={v.code} />}
      </div>
    </li>
  );
}

function VisitStatus({ v, due }: { v: CalendarVisit; due: boolean }) {
  const [label, tone] =
    v.status === "visited"
      ? [`Visited${v.checkedInAt ? ` · ${timeOfDay(v.checkedInAt)}` : ""}`, "bg-sage text-white"]
      : v.status === "no_show"
        ? ["Missed", "bg-clay-soft text-destructive"]
        : due
          ? ["Outcome needed", "bg-destructive/10 font-medium text-destructive"]
          : ["Booked", "bg-ochre-soft text-foreground"];
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap", tone)}>
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Week                                                               */
/* ------------------------------------------------------------------ */

function WeekView({
  days,
  slots,
  visits,
  today,
  now,
  dayHref,
}: {
  days: string[];
  slots: CalendarSlot[];
  visits: CalendarVisit[];
  today: string;
  now: Date;
  dayHref: (d: string) => string;
}) {
  const slotsByDay = Map.groupBy(slots, (s) => istDate(s.startsAt));
  const visitsByDay = Map.groupBy(visits, (v) => istDate(v.startsAt));
  return (
    <ol className="grid gap-3 md:grid-cols-7">
      {days.map((d) => {
        const daySlots = slotsByDay.get(d) ?? [];
        const dayVisits = visitsByDay.get(d) ?? [];
        const booked = daySlots.reduce((a, s) => a + s.booked, 0);
        const capacity = daySlots.reduce((a, s) => a + (s.blocked ? 0 : s.capacity), 0);
        return (
          <li
            key={d}
            className={cn(
              "flex min-w-0 flex-col rounded-2xl border bg-card",
              d === today ? "border-primary ring-1 ring-primary" : "border-border",
              d < today && "bg-background",
            )}
          >
            <Link
              href={dayHref(d)}
              className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2.5 hover:bg-secondary/60 md:block"
              aria-current={d === today ? "date" : undefined}
            >
              <span className="text-xs text-muted-foreground uppercase">
                {longDate(d, { weekday: "short" })}
              </span>
              <span className="tabular block text-lg md:text-xl">
                {longDate(d, { day: "numeric", month: "short" })}
              </span>
            </Link>
            <div className="flex-1 space-y-1.5 p-2">
              {!daySlots.length ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">No slots</p>
              ) : !dayVisits.length ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">No visits</p>
              ) : (
                dayVisits.map((v) => {
                  const due = outcomeDue(v, now);
                  // Booked visits are the quiet default; anything else says so in words.
                  const [label, tone] =
                    v.status === "visited"
                      ? ["Visited", "border-sage text-accent-foreground"]
                      : v.status === "no_show"
                        ? ["Missed", "border-clay text-destructive"]
                        : due
                          ? ["Needs outcome", "border-destructive bg-clay-soft text-destructive"]
                          : ["Booked", "border-ochre"];
                  return (
                    <Link
                      key={v.code}
                      href={`/staff/leads/${v.leadCode}`}
                      className={cn(
                        "block rounded-lg border-l-2 bg-secondary/60 px-2 py-1.5 text-xs hover:bg-secondary",
                        tone,
                      )}
                    >
                      <span className="tabular block text-muted-foreground">
                        {timeOfDay(v.startsAt)}
                      </span>
                      <span className="block truncate font-medium text-foreground">
                        {v.buyerName ?? v.leadCode}
                      </span>
                      <span className={cn("block", label === "Booked" && "sr-only")}>{label}</span>
                    </Link>
                  );
                })
              )}
            </div>
            {capacity > 0 && (
              <p className="tabular border-t border-border px-3 py-2 text-xs text-muted-foreground">
                {booked} of {capacity} places booked
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function CalendarSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-9 w-48 animate-pulse rounded bg-muted" />
      <div className="h-14 animate-pulse rounded-2xl bg-muted" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  );
}
