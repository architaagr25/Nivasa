import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Bot, CircleCheck, UserRound } from "lucide-react";
import { SourceBadge, StatusBadge } from "@/components/staff/badges";
import { DuplicateActions, ReviewFlagForm } from "@/components/staff/review-actions";
import { formatPhone } from "@/lib/phone";
import { requireStaff } from "@/lib/session";
import { ago, dateTime, lakh } from "@/lib/staff-format";
import { cn } from "@/lib/utils";
import { FLAG_LABEL } from "@/server/staff/labels";
import {
  listDuplicates,
  listFlags,
  reviewCounts,
  type DuplicateRow,
  type FlagRow,
} from "@/server/staff/review";

export const metadata: Metadata = { title: "Review" };

type Reason = keyof typeof FLAG_LABEL;
const LANGUAGE = { en: "English", hi: "Hindi", gu: "Gujarati" } as const;

// Flags that need a decision from a person come first in the colour order: a price or
// override attempt is a risk, a missing fact is a gap in the sheet, the rest are follow-ups.
const REASON_TONE: Record<Reason, string> = {
  price_or_discount: "bg-clay-soft text-destructive",
  prompt_injection: "bg-clay-soft text-destructive",
  guardrail_blocked: "bg-clay-soft text-destructive",
  missing_fact: "bg-ochre-soft text-foreground",
  human_requested: "bg-sage-soft text-accent-foreground",
  ai_unavailable: "bg-secondary text-foreground",
};

export default function ReviewPage(props: PageProps<"/staff/review">) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <Suspense fallback={<ReviewSkeleton />}>
        <Review {...props} />
      </Suspense>
    </div>
  );
}

async function Review({ searchParams }: PageProps<"/staff/review">) {
  await requireStaff("sales_head");
  const sp = await searchParams;
  const tab = sp.tab === "duplicates" ? "duplicates" : "flags";
  const reviewed = tab === "flags" && sp.show === "reviewed";
  const reason =
    typeof sp.reason === "string" && sp.reason in FLAG_LABEL ? (sp.reason as Reason) : null;
  const counts = await reviewCounts();

  const tabLink = (key: "flags" | "duplicates", label: string, n: number) => (
    <Link
      href={key === "flags" ? "/staff/review" : "/staff/review?tab=duplicates"}
      aria-current={tab === key ? "page" : undefined}
      className={cn(
        "-mb-px flex min-h-11 items-center gap-2 border-b-2 px-1 text-sm",
        tab === key
          ? "border-foreground font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "tabular rounded-full px-1.5 text-xs",
          n ? "bg-clay text-white" : "bg-secondary text-muted-foreground",
        )}
      >
        {n}
      </span>
    </Link>
  );

  return (
    <>
      <div>
        <h1 className="text-3xl font-light">Review</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Chats the assistant flagged for a person, and leads that may be the same buyer twice.
        </p>
      </div>
      <nav className="flex gap-6 border-b border-border" aria-label="Review">
        {tabLink("flags", "Flagged chats", counts.flags)}
        {tabLink("duplicates", "Possible duplicates", counts.duplicates)}
      </nav>
      {tab === "flags" ? <Flags reviewed={reviewed} reason={reason} /> : <Duplicates />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Flagged chats                                                      */
/* ------------------------------------------------------------------ */

async function Flags({ reviewed, reason }: { reviewed: boolean; reason: Reason | null }) {
  const all = await listFlags(reviewed, reviewed ? 30 : 200);
  const rows = reason ? all.filter((f) => f.flag.reason === reason) : all;
  const byReason = Map.groupBy(all, (f) => f.flag.reason);
  const now = new Date();
  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card hover:border-foreground/40",
    );
  const href = (r: Reason | null, show = reviewed) => {
    const q = new URLSearchParams();
    if (show) q.set("show", "reviewed");
    if (r) q.set("reason", r);
    return `/staff/review${q.size ? `?${q}` : ""}`;
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1.5" aria-label="Reason">
          <Link
            href={href(null)}
            className={chip(!reason)}
            aria-current={!reason ? "page" : undefined}
          >
            All
          </Link>
          {[...byReason.entries()].map(([r, list]) => (
            <Link
              key={r}
              href={href(r)}
              className={chip(reason === r)}
              aria-current={reason === r ? "page" : undefined}
            >
              <span className="first-letter:uppercase">{FLAG_LABEL[r]}</span>
              <span className="tabular opacity-70">{list.length}</span>
            </Link>
          ))}
        </nav>
        <Link
          href={href(null, !reviewed)}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {reviewed ? "← Waiting for review" : "Recently reviewed →"}
        </Link>
      </div>

      {!rows.length ? (
        <p className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-5 py-12 text-muted-foreground">
          <CircleCheck className="size-4" aria-hidden />
          {reviewed
            ? "Nothing reviewed yet."
            : "Nothing waiting. Every flagged chat has been looked at."}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((f) => (
            <FlagCard key={f.flag.id} f={f} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FlagCard({ f, now }: { f: FlagRow; now: Date }) {
  return (
    <li className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium first-letter:uppercase",
            REASON_TONE[f.flag.reason],
          )}
        >
          {FLAG_LABEL[f.flag.reason]}
        </span>
        {f.leadCode ? (
          <Link
            href={`/staff/leads/${f.leadCode}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {f.buyerName ?? "Unnamed buyer"} · {f.leadCode}
          </Link>
        ) : (
          <span className="text-muted-foreground">A visitor who hasn&apos;t shared a number</span>
        )}
        {f.projectName && <span className="text-muted-foreground">{f.projectName}</span>}
        <span
          className="tabular ml-auto text-xs text-muted-foreground"
          title={dateTime(f.flag.createdAt)}
        >
          {ago(f.flag.createdAt, now)}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        {f.asked && (
          <Quote who="Buyer" icon={UserRound} lang={f.language}>
            {f.asked}
          </Quote>
        )}
        {f.reply && (
          <Quote who="Assistant" icon={Bot} tone="muted">
            {f.reply}
          </Quote>
        )}
        {f.flag.detail && <p className="text-muted-foreground">{f.flag.detail}</p>}
      </div>

      {f.flag.reason === "missing_fact" && f.projectId && !f.flag.reviewedAt && (
        <Link
          href={`/staff/admin?project=${f.projectId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
        >
          Add the answer to the {f.projectName} fact sheet{" "}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}

      {f.flag.reviewedAt ? (
        <p className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-accent-foreground" aria-hidden />
          Reviewed by {f.reviewerName ?? "the sales head"} {ago(f.flag.reviewedAt, now)}
          {f.flag.reviewNote && <span className="text-foreground">· {f.flag.reviewNote}</span>}
        </p>
      ) : (
        <ReviewFlagForm flagId={f.flag.id} />
      )}
    </li>
  );
}

function Quote({
  who,
  icon: Icon,
  tone,
  lang,
  children,
}: {
  who: string;
  icon: typeof Bot;
  tone?: "muted";
  lang?: keyof typeof LANGUAGE;
  children: React.ReactNode;
}) {
  return (
    <figure
      className={cn(
        "rounded-xl px-4 py-3",
        tone === "muted" ? "bg-secondary/60" : "border-l-2 border-ochre bg-ochre-soft/60",
      )}
    >
      <figcaption className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden /> {who}
        {lang && lang !== "en" && <span>· in {LANGUAGE[lang]}</span>}
      </figcaption>
      <blockquote className="whitespace-pre-line">{children}</blockquote>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Duplicates                                                         */
/* ------------------------------------------------------------------ */

async function Duplicates() {
  const rows = await listDuplicates();
  const now = new Date();
  if (!rows.length) {
    return (
      <p className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-5 py-12 text-muted-foreground">
        <CircleCheck className="size-4" aria-hidden /> No possible duplicates waiting.
      </p>
    );
  }
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Leads with the same number are merged automatically. These share an email address or a very
        similar name on the same project, so a person decides.
      </p>
      <ul className="space-y-3">
        {rows.map((d) => (
          <DuplicateCard key={d.id} d={d} now={now} />
        ))}
      </ul>
    </section>
  );
}

function DuplicateCard({ d, now }: { d: DuplicateRow; now: Date }) {
  // The lead that came in first is the one kept.
  const [keep, drop] =
    d.lead.createdAt <= d.other.createdAt ? [d.lead, d.other] : [d.other, d.lead];
  type L = typeof keep;
  const fields: [string, (l: L) => React.ReactNode, (l: L) => unknown][] = [
    ["Name", (l) => l.name ?? "—", (l) => l.name?.toLowerCase()],
    [
      "Phone",
      (l) => (l.phone ? <span className="tabular">{formatPhone(l.phone)}</span> : "—"),
      (l) => l.phone,
    ],
    ["Email", (l) => <span className="break-all">{l.email ?? "—"}</span>, (l) => l.email],
    [
      "Wants",
      (l) =>
        [
          l.projectId?.replace("project-", "Project "),
          l.wantsBhk,
          l.budgetMaxInr ? `up to ${lakh(l.budgetMaxInr)}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "—",
      () => null,
    ],
    ["Came from", (l) => <SourceBadge source={l.firstSource} />, () => null],
    [
      "Came in",
      (l) => <span title={dateTime(l.createdAt)}>{ago(l.createdAt, now)}</span>,
      () => null,
    ],
    ["Status", (l) => <StatusBadge status={l.status} />, () => null],
    ["Owner", (l) => l.ownerName ?? "Unassigned", () => null],
  ];

  return (
    <li className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-ochre-soft px-2.5 py-0.5 text-xs font-medium">
          {d.reason}
        </span>
        <span className="tabular text-muted-foreground">{d.similarity}% match</span>
      </p>
      <div className="hidden sm:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-28 pb-2 font-normal" />
              {[keep, drop].map((l, i) => (
                <th key={l.id} className="pb-2 font-normal">
                  <Link
                    href={`/staff/leads/${l.code}`}
                    className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {l.code}
                  </Link>{" "}
                  · {i === 0 ? "came in first, kept" : "would merge in"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {fields.map(([label, show, same]) => {
              const a = same(keep);
              const match = a != null && a === same(drop);
              return (
                <tr key={label}>
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">
                    {label}
                  </th>
                  {[keep, drop].map((l) => (
                    <td key={l.id} className={cn("py-2 pr-3", match && "text-accent-foreground")}>
                      <span className="inline-flex items-center gap-1.5">
                        {show(l)}
                        {match && <CircleCheck className="size-3.5 shrink-0" aria-label="same" />}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Phones: one field at a time, both leads' values stacked, so nothing hides off-screen. */}
      <dl className="divide-y divide-border text-sm sm:hidden">
        {fields.map(([label, show, same]) => {
          const a = same(keep);
          const match = a != null && a === same(drop);
          return (
            <div key={label} className="py-2.5">
              <dt className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                {label}
                {match && (
                  <span className="flex items-center gap-1 text-accent-foreground">
                    <CircleCheck className="size-3.5" aria-hidden /> same
                  </span>
                )}
              </dt>
              {[keep, drop].map((l) => (
                <dd key={l.id} className="flex min-w-0 items-baseline gap-2">
                  <span className="tabular w-[4.5rem] shrink-0 text-xs text-muted-foreground">
                    {l.code}
                  </span>
                  <span className="min-w-0">{show(l)}</span>
                </dd>
              ))}
            </div>
          );
        })}
      </dl>
      <p className="text-xs text-muted-foreground sm:hidden">
        {keep.code} came in first and is kept.
      </p>
      <DuplicateActions candidateId={d.id} keepCode={keep.code} dropCode={drop.code} />
    </li>
  );
}

function ReviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-9 w-48 animate-pulse rounded bg-muted" />
      <div className="h-11 animate-pulse rounded bg-muted" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  );
}
