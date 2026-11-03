import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CalendarX2, CircleCheck, CircleSlash, Clock3, QrCode } from "lucide-react";
import { CheckInButton } from "@/components/staff/check-in-button";
import { formatPhone, maskPhone } from "@/lib/phone";
import { getSession, requireStaff } from "@/lib/session";
import { dateTime, lakh, timeOfDay } from "@/lib/staff-format";
import { istDate } from "@/lib/time";
import { EARLY_CHECKIN_MS } from "@/server/bookings/service";
import { canSeePhone } from "@/server/staff/leads";
import { checkInWindow, visitByCheckinToken, type CheckInVisit } from "@/server/staff/visits";

export const metadata: Metadata = { title: "Site check-in" };

const LANGUAGE = { en: "English", hi: "Hindi", gu: "Gujarati" } as const;

// Opened from the QR code on a buyer's visit pass, usually on a phone at the site office, so
// it stands on its own without the workspace menu.
export default function CheckInPage(props: PageProps<"/staff/check-in/[token]">) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/staff/visits" className="font-heading text-2xl">
          Nivasa
        </Link>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <QrCode className="size-4" aria-hidden /> Site check-in
        </span>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
        <CheckIn {...props} />
      </Suspense>
    </main>
  );
}

async function CheckIn({ params }: PageProps<"/staff/check-in/[token]">) {
  const { token } = await params;
  // Someone scanning before signing in comes straight back here afterwards.
  const session = await getSession();
  if (!session || (session.user.role !== "sales_exec" && session.user.role !== "sales_head")) {
    redirect(`/staff/sign-in?next=${encodeURIComponent(`/staff/check-in/${token}`)}`);
  }
  const viewer = await requireStaff();
  const visit = await visitByCheckinToken(token);

  if (!visit) {
    return (
      <div className="space-y-4">
        <State
          icon={CircleSlash}
          tone="bad"
          title="This code isn't recognised"
          body="It may have been copied wrongly, or the visit was moved and the buyer has a newer pass. Find them on the visits calendar instead."
        />
        <BackLink />
      </div>
    );
  }

  const now = new Date();
  const opensAt = new Date(visit.startsAt.getTime() - EARLY_CHECKIN_MS);
  const when = checkInWindow(visit.startsAt, now);
  const phone = !visit.phone
    ? "—"
    : canSeePhone(viewer, visit.ownerId)
      ? formatPhone(visit.phone)
      : maskPhone(visit.phone);

  return (
    <div className="space-y-4">
      {visit.status === "visited" ? (
        <State
          icon={CircleCheck}
          tone="good"
          title="Checked in"
          body={
            visit.checkedInAt
              ? `Arrived ${istDate(visit.checkedInAt) === istDate(now) ? `at ${timeOfDay(visit.checkedInAt)}` : dateTime(visit.checkedInAt)}. Nothing more to do here.`
              : "Recorded as visited. Nothing more to do here."
          }
        />
      ) : visit.status === "no_show" ? (
        <State
          icon={CalendarX2}
          tone="bad"
          title="Recorded as a missed visit"
          body="If the buyer is here after all, their executive can book them into a free slot from the lead page."
        />
      ) : visit.status === "cancelled" ? (
        <State
          icon={CalendarX2}
          tone="bad"
          title="This visit was cancelled"
          body="The pass is no longer valid. If the buyer has a new booking, they'll have a new pass."
        />
      ) : null}

      <Details visit={visit} phone={phone} viewerId={viewer.id} />

      {visit.status === "booked" &&
        (when === "open" ? (
          <CheckInButton token={token} name={visit.buyerName?.split(" ")[0] ?? "the buyer"} />
        ) : (
          <p className="flex items-start gap-2 rounded-xl bg-ochre-soft px-4 py-3 text-sm">
            <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {when === "past_day" ? (
                <>
                  This pass was for {dateTime(visit.startsAt)}, so it can&apos;t be used to check in
                  today. Record what happened from the{" "}
                  <Link
                    href={`/staff/visits?date=${istDate(visit.startsAt)}`}
                    className="underline underline-offset-4"
                  >
                    visits calendar
                  </Link>
                  .
                </>
              ) : istDate(visit.startsAt) === istDate(now) ? (
                `Check-in opens at ${timeOfDay(opensAt)}, half an hour before the visit.`
              ) : (
                `This visit is on ${dateTime(visit.startsAt)}. Check-in opens half an hour before.`
              )}
            </span>
          </p>
        ))}

      <BackLink />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/staff/visits"
      className="flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden /> Today&apos;s visits
    </Link>
  );
}

function Details({
  visit,
  phone,
  viewerId,
}: {
  visit: CheckInVisit;
  phone: string;
  viewerId: string;
}) {
  const wants = [
    visit.wantsBhk,
    visit.budgetMaxInr ? `up to ${lakh(visit.budgetMaxInr)}` : null,
  ].filter(Boolean);
  const rows: [string, React.ReactNode][] = [
    ["When", dateTime(visit.startsAt)],
    ["Meeting", `${visit.executiveName ?? "—"}${visit.executiveId === viewerId ? " (you)" : ""}`],
    ["Looking for", wants.length ? wants.join(", ") : "—"],
    ["Speaks", LANGUAGE[visit.language]],
    [
      "Phone",
      <span key="p" className="tabular">
        {phone}
      </span>,
    ],
  ];
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{visit.projectName}</p>
      <h1 className="mt-0.5 text-2xl font-light">{visit.buyerName ?? "Buyer"}</h1>
      <p className="tabular mt-1 text-xs text-muted-foreground">
        Visit {visit.code} ·{" "}
        <Link href={`/staff/leads/${visit.leadCode}`} className="underline underline-offset-4">
          {visit.leadCode}
        </Link>
      </p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function State({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone: "good" | "bad";
  title: string;
  body: string;
}) {
  return (
    <section
      className={
        tone === "good"
          ? "flex gap-3 rounded-2xl bg-sage-soft p-5"
          : "flex gap-3 rounded-2xl bg-clay-soft p-5"
      }
    >
      <Icon
        className={tone === "good" ? "size-6 text-accent-foreground" : "size-6 text-destructive"}
        aria-hidden
      />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
    </section>
  );
}
