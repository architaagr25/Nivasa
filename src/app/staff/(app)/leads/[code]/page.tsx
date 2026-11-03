import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowLeft,
  CalendarCheck,
  CircleAlert,
  Copy,
  Flag,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { ScoreDot, SourceBadge, StatusBadge } from "@/components/staff/badges";
import {
  ClaimButton,
  CloseLeadButton,
  ReassignSelect,
  VisitOutcome,
} from "@/components/staff/lead-actions";
import { Transcript } from "@/components/staff/transcript";
import { requireStaff } from "@/lib/session";
import { ago, dateTime, formatDuration, lakh } from "@/lib/staff-format";
import { cn } from "@/lib/utils";
import { getLead, type TimelineEvent } from "@/server/staff/leads";
import { FLAG_LABEL } from "@/server/staff/labels";

export const metadata: Metadata = { title: "Lead" };

export default function LeadPage(props: PageProps<"/staff/leads/[code]">) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      <Suspense fallback={<div className="h-[70vh] animate-pulse rounded-2xl bg-muted" />}>
        <Lead {...props} />
      </Suspense>
    </div>
  );
}

const TIMELINE_ICON = {
  touch: Mail,
  message: MessageSquare,
  visit: CalendarCheck,
  consent: ShieldCheck,
  outbox: MessageSquare,
  flag: Flag,
  handoff: UserRound,
} satisfies Record<TimelineEvent["kind"], unknown>;

async function Lead({ params }: PageProps<"/staff/leads/[code]">) {
  const viewer = await requireStaff();
  const { code } = await params;
  const data = await getLead(viewer, code);
  if (!data) notFound();
  const { lead, handoff } = data;
  const head = viewer.role === "sales_head";
  const now = new Date();

  const wants = [
    ["Project", lead.projectName],
    ["Home", lead.wantsBhk?.replace("BHK", " BHK")],
    ["Budget", lead.budgetMaxInr ? `up to ${lakh(lead.budgetMaxInr)}` : null],
    ["Buying in", lead.timeline?.replace("m", " months").replace("+", "+")],
    [
      "Purpose",
      lead.purpose === "self_use"
        ? "To live in"
        : lead.purpose === "investment"
          ? "Investment"
          : null,
    ],
    ["Language", { en: "English", hi: "Hindi", gu: "Gujarati" }[lead.language]],
  ] as const;

  return (
    <div className="space-y-6">
      <Link
        href="/staff/leads"
        className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> All leads
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-light">{lead.name ?? "Unnamed website visitor"}</h1>
            <StatusBadge status={lead.status} />
            <ScoreDot score={lead.score} />
          </div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="font-mono">{lead.code}</span>
            <SourceBadge source={lead.firstSource} />
            <span>Came in {ago(lead.createdAt, now)}</span>
            <span
              className={cn(
                (lead.responseSeconds === null || lead.responseSeconds > 300) && "text-destructive",
              )}
            >
              First reply: {formatDuration(lead.responseSeconds)}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {lead.phone &&
              (lead.phoneHref ? (
                <a
                  href={lead.phoneHref}
                  className="inline-flex min-h-9 items-center gap-1.5 font-medium underline-offset-4 hover:underline"
                >
                  <Phone className="size-4" aria-hidden /> {lead.phone}
                </a>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 text-muted-foreground"
                  title="Take the lead to see the full number"
                >
                  <Phone className="size-4" aria-hidden /> {lead.phone}
                </span>
              ))}
            {lead.email && data.canSeePhone && (
              <span className="text-muted-foreground">{lead.email}</span>
            )}
            {lead.optedOutAt && (
              <span className="rounded-full bg-clay-soft px-2 py-0.5 text-xs text-destructive">
                Opted out of messages
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!lead.ownerId && !head && <ClaimButton code={lead.code} />}
          {head ? (
            <ReassignSelect code={lead.code} current={lead.ownerId} team={data.team} />
          ) : (
            lead.ownerName && (
              <span className="text-sm text-muted-foreground">Owner: {lead.ownerName}</span>
            )
          )}
          {(head || lead.ownerId === viewer.id) && (
            <CloseLeadButton code={lead.code} closed={lead.status === "closed_lost"} />
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          {handoff?.handoffSummary && (
            <section className="rounded-2xl bg-primary p-5 text-primary-foreground">
              <p className="flex items-center gap-2 text-xs tracking-[0.12em] uppercase opacity-70">
                <Sparkles className="size-3.5" aria-hidden /> Handoff summary
              </p>
              <p className="mt-2 leading-relaxed">{handoff.handoffSummary}</p>
              <p className="mt-3 text-xs opacity-70">
                {handoff.handoffReason} · {handoff.handedOffAt ? ago(handoff.handedOffAt, now) : ""}
              </p>
            </section>
          )}

          {data.openFlags.length > 0 && (
            <section className="space-y-2 rounded-2xl bg-clay-soft p-5">
              <p className="flex items-center gap-2 font-medium text-destructive">
                <CircleAlert className="size-4" aria-hidden /> Needs a person
              </p>
              <ul className="space-y-1.5 text-sm">
                {data.openFlags.map((f) => (
                  <li key={f.id}>
                    <span className="font-medium">{FLAG_LABEL[f.reason]}</span>
                    {f.detail && <span className="text-muted-foreground"> · {f.detail}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-4 text-lg font-normal">What they want</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {wants.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd>{v ?? <span className="text-muted-foreground">Not known yet</span>}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-4 text-lg font-normal">Site visits</h2>
            {data.visits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No visit booked yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.visits.map((v) => {
                  const due =
                    v.status === "booked" && v.startsAt.getTime() - now.getTime() < 30 * 60 * 1000;
                  const mine = head || v.executiveId === viewer.id;
                  return (
                    <li
                      key={v.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="font-medium">{dateTime(v.startsAt)}</p>
                        <p className="text-sm text-muted-foreground">
                          {v.project} · with {v.exec} · <span className="font-mono">{v.code}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Reminders:{" "}
                          {v.reminders
                            .map(
                              (r) =>
                                `${r.kind === "day_before" ? "day before" : "2 h before"} ${r.status}`,
                            )
                            .join(", ") || "none"}
                        </p>
                      </div>
                      {due && mine ? (
                        <VisitOutcome code={v.code} />
                      ) : (
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs",
                            v.status === "booked" && v.startsAt < now
                              ? "bg-ochre-soft"
                              : "bg-secondary",
                          )}
                        >
                          {v.status === "booked"
                            ? v.startsAt < now
                              ? "Outcome not recorded"
                              : "Upcoming"
                            : v.status.replace("_", "-")}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {data.duplicates.length > 0 && (
            <section className="rounded-2xl border border-ochre/40 bg-ochre-soft p-5">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-normal">
                <Copy className="size-4" aria-hidden /> Possible duplicate
              </h2>
              {data.duplicates.map((d) => (
                <div key={d.id} className="text-sm">
                  <p>
                    <Link
                      href={`/staff/leads/${d.other.code}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {d.other.name ?? "Unnamed"} · {d.other.code}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      ({d.reason}, {d.similarity}% match)
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    {d.other.phone} · came in {ago(d.other.createdAt, now)}
                  </p>
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-4 text-lg font-normal">Conversation</h2>
            {data.transcript.length === 0 ? (
              <p className="text-sm text-muted-foreground">No chat with the assistant yet.</p>
            ) : (
              <Transcript
                leadCode={lead.code}
                items={data.transcript.map((m) => ({
                  id: m.id,
                  role: m.role,
                  content: m.content,
                  time: dateTime(m.createdAt),
                  meta: `${m.citedFacts?.length ? ` · cited ${m.citedFacts.join(", ")}` : ""}${m.guardrail ? ` · check: ${m.guardrail.replace(/_/g, " ")}` : ""}`,
                  translations: m.translations ?? {},
                }))}
              />
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-4 text-lg font-normal">Timeline</h2>
            <ol className="relative space-y-4 border-l border-border pl-5">
              {data.timeline.map((e, i) => {
                const Icon = TIMELINE_ICON[e.kind];
                return (
                  <li key={i} className="relative">
                    <span
                      className={cn(
                        "absolute top-0.5 -left-[1.95rem] flex size-6 items-center justify-center rounded-full ring-4 ring-card",
                        e.tone === "good"
                          ? "bg-sage-soft text-accent-foreground"
                          : e.tone === "warn"
                            ? "bg-ochre-soft"
                            : e.tone === "bad"
                              ? "bg-clay-soft text-destructive"
                              : "bg-secondary text-muted-foreground",
                      )}
                      aria-hidden
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <p className="text-sm">{e.title}</p>
                    {e.detail && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{e.detail}</p>
                    )}
                    <p className="text-[0.68rem] text-muted-foreground">{dateTime(e.at)}</p>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
