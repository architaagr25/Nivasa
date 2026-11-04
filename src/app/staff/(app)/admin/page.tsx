import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, asc, eq, gte, isNull, max, or } from "drizzle-orm";
import { CircleCheck, FilePenLine, History } from "lucide-react";
import { FactSheetEditor } from "@/components/staff/fact-sheet-editor";
import { PageTabs } from "@/components/staff/page-tabs";
import { ClosedDays, SlotTemplateEditor } from "@/components/staff/slot-editor";
import { StartDraftButton } from "@/components/staff/start-draft-button";
import { db } from "@/db";
import { blackoutDates, projects, slots, slotTemplates } from "@/db/schema";
import { CATEGORIES, CATEGORY_LABEL, factSheetWarnings } from "@/lib/fact-sheet-checks";
import { requireStaff } from "@/lib/session";
import { ago, dateTime } from "@/lib/staff-format";
import { addDays, istDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getFactSheet } from "@/server/admin/fact-sheet";

export const metadata: Metadata = { title: "Fact sheet & slots" };

export default function AdminPage(props: PageProps<"/staff/admin">) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <Suspense fallback={<div className="h-[70vh] animate-pulse rounded-2xl bg-muted" />}>
        <Admin {...props} />
      </Suspense>
    </div>
  );
}

async function Admin({ searchParams }: PageProps<"/staff/admin">) {
  await requireStaff("sales_head");
  const sp = await searchParams;
  const all = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(asc(projects.id));
  const projectId = all.find((p) => p.id === sp.project)?.id ?? all[0].id;
  const tab = sp.tab === "slots" ? "slots" : "facts";
  const published = typeof sp.published === "string" ? sp.published : null;

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-9 items-center rounded-full border px-3.5 py-1.5 text-sm",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card hover:border-foreground/40",
    );
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light">Fact sheet & slots</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            What the assistant and the project pages say, and when buyers can book a visit.
          </p>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Project">
          {all.map((p) => (
            <Link
              key={p.id}
              href={`/staff/admin?project=${p.id}${tab === "slots" ? "&tab=slots" : ""}`}
              className={chip(p.id === projectId)}
              aria-current={p.id === projectId ? "page" : undefined}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      </div>
      <PageTabs
        label="Section"
        current={tab}
        tabs={[
          { key: "facts", label: "Fact sheet", href: `/staff/admin?project=${projectId}` },
          {
            key: "slots",
            label: "Visiting times",
            href: `/staff/admin?project=${projectId}&tab=slots`,
          },
        ]}
        fallback={<div className="h-[60vh] animate-pulse rounded-2xl bg-muted" />}
      >
        {tab === "facts" ? (
          <FactSheet projectId={projectId} justPublished={published} />
        ) : (
          <Slots projectId={projectId} projectName={all.find((p) => p.id === projectId)!.name} />
        )}
      </PageTabs>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Fact sheet                                                         */
/* ------------------------------------------------------------------ */

async function FactSheet({
  projectId,
  justPublished,
}: {
  projectId: string;
  justPublished: string | null;
}) {
  const sheet = (await getFactSheet(projectId))!;
  const live = sheet.published;

  return (
    <div className="space-y-6">
      {justPublished && !sheet.draft && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl bg-sage-soft px-4 py-3 text-sm"
        >
          <CircleCheck className="size-4 text-accent-foreground" aria-hidden />
          Version {justPublished} is live. The project page and the assistant are using it now.
        </p>
      )}

      {sheet.draft ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-normal">
              <FilePenLine className="size-4" aria-hidden /> Draft version {sheet.draft.version}
            </h2>
            <p className="text-xs text-muted-foreground">
              Started by {sheet.draft.createdBy ?? "the sales head"} {ago(sheet.draft.createdAt)}.
              Buyers still see version {live?.version ?? "—"} until you publish.
            </p>
          </div>
          <FactSheetEditor
            projectId={projectId}
            version={sheet.draft.version}
            draft={sheet.draft.facts}
            live={live?.facts ?? []}
            changeNote={sheet.draft.changeNote ?? ""}
          />
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-normal">Live: version {live?.version ?? "—"}</h2>
              {live?.publishedAt && (
                <p className="text-xs text-muted-foreground">
                  Published {dateTime(live.publishedAt)}
                  {live.publishedBy ? ` by ${live.publishedBy}` : ""}
                </p>
              )}
            </div>
            <StartDraftButton projectId={projectId} next={(sheet.history[0]?.version ?? 0) + 1} />
          </div>
          {live && <LiveFacts facts={live.facts} />}
        </section>
      )}

      {sheet.history.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-normal">
            <History className="size-4" aria-hidden /> Versions
          </h2>
          <ol className="divide-y divide-border rounded-2xl border border-border bg-card text-sm">
            {sheet.history.map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
                <span className="tabular w-20 font-medium">Version {v.version}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    v.status === "published" ? "bg-sage text-white" : "bg-secondary",
                  )}
                >
                  {v.status === "published" ? "Live" : "Archived"}
                </span>
                <span className="min-w-0 flex-1">
                  {v.changeNote ?? <span className="text-muted-foreground">No note</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {v.publishedAt ? dateTime(v.publishedAt) : "—"}
                  {v.publishedBy ? ` · ${v.publishedBy}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function LiveFacts({
  facts,
}: {
  facts: { code: string; category: (typeof CATEGORIES)[number]; label: string; value: string }[];
}) {
  const warnings = factSheetWarnings(facts);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {CATEGORIES.filter((c) => facts.some((f) => f.category === c)).map((c) => (
          <section key={c} className="rounded-2xl border border-border bg-card p-4">
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {CATEGORY_LABEL[c]}
            </h3>
            <dl className="space-y-3 text-sm">
              {facts
                .filter((f) => f.category === c)
                .map((f) => (
                  <div key={f.code}>
                    <dt className="flex items-baseline justify-between gap-2 font-medium">
                      {f.label}
                      <code className="font-mono text-[0.7rem] font-normal text-muted-foreground">
                        {f.code}
                      </code>
                    </dt>
                    <dd className="mt-0.5 text-muted-foreground">{f.value}</dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
      </div>
      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-2xl bg-ochre-soft p-4 text-sm">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        The assistant answers only from these facts and cites the code next to each one. Anything
        not here, such as maintenance or parking charges, is handed to the sales team.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Visiting times                                                     */
/* ------------------------------------------------------------------ */

async function Slots({ projectId, projectName }: { projectId: string; projectName: string }) {
  const today = istDate(new Date());
  const [templates, closed, [{ last }]] = await Promise.all([
    db
      .select()
      .from(slotTemplates)
      .where(and(eq(slotTemplates.projectId, projectId), eq(slotTemplates.active, true)))
      .orderBy(asc(slotTemplates.weekday), asc(slotTemplates.startTime)),
    db
      .select({
        id: blackoutDates.id,
        date: blackoutDates.date,
        reason: blackoutDates.reason,
        projectId: blackoutDates.projectId,
      })
      .from(blackoutDates)
      .where(
        and(
          or(eq(blackoutDates.projectId, projectId), isNull(blackoutDates.projectId)),
          gte(blackoutDates.date, today),
        ),
      )
      .orderBy(asc(blackoutDates.date)),
    db
      .select({ last: max(slots.startsAt) })
      .from(slots)
      .where(eq(slots.projectId, projectId)),
  ]);

  const initial: Record<number, { startTime: string; durationMin: number; capacity: number }[]> =
    {};
  for (const t of templates) {
    (initial[t.weekday] ??= []).push({
      startTime: t.startTime.slice(0, 5),
      durationMin: t.durationMin,
      capacity: t.capacity,
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-normal">Every week</h2>
          <p className="text-xs text-muted-foreground">
            {last
              ? `Buyers can book up to ${dateTime(last).split(",").slice(0, 2).join(",")}. `
              : ""}
            <Link
              href={`/staff/visits?project=${projectId}&view=week`}
              className="underline underline-offset-4"
            >
              See the calendar
            </Link>
          </p>
        </div>
        <SlotTemplateEditor projectId={projectId} initial={initial} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-normal">Closed days</h2>
        <p className="text-sm text-muted-foreground">
          Festivals and holidays. Nobody can book on these days; visits already booked are listed so
          they can be moved.
        </p>
        <ClosedDays
          projectId={projectId}
          projectName={projectName}
          days={closed}
          minDate={addDays(today, 1)}
        />
      </section>
    </div>
  );
}
