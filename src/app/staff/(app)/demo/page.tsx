import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, outbox, staffProfiles } from "@/db/schema";
import { DemoPanel } from "@/components/staff/demo-panel";
import { AutoRefresh } from "@/components/staff/lead-filters";
import { maskPhone } from "@/lib/phone";
import { requireStaff } from "@/lib/session";
import { ago } from "@/lib/staff-format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Message outbox" };

const CHANNEL = { whatsapp: "WhatsApp", sms: "SMS", staff_alert: "Staff alert" } as Record<
  string,
  string
>;

export default function DemoPage(props: PageProps<"/staff/demo">) {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-light">Message outbox</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            There is no real WhatsApp or SMS gateway in this build. Every message the product sends
            is recorded here instead, exactly as it would go out.
          </p>
        </div>
        <AutoRefresh />
      </div>
      <Suspense fallback={<div className="h-[60vh] animate-pulse rounded-2xl bg-muted" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}

async function Content({ searchParams }: PageProps<"/staff/demo">) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const channel = typeof sp.channel === "string" && sp.channel in CHANNEL ? sp.channel : null;
  const rows = await db
    .select({
      m: outbox,
      code: leads.code,
      name: leads.name,
      ownerId: leads.ownerId,
      staff: staffProfiles.displayName,
    })
    .from(outbox)
    .leftJoin(leads, eq(leads.id, outbox.leadId))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, outbox.toUserId))
    .where(channel ? eq(outbox.channel, channel) : undefined)
    .orderBy(desc(outbox.createdAt))
    .limit(60);
  const now = new Date();
  const seeAll = viewer.role === "sales_head";

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      {process.env.DEMO_MODE === "true" ? (
        <DemoPanel />
      ) : (
        <p className="text-sm text-muted-foreground">
          Simulators are switched off outside demo mode.
        </p>
      )}

      <section id="outbox" className="scroll-mt-20 space-y-3">
        <nav className="flex flex-wrap gap-1.5" aria-label="Channel">
          {[null, "whatsapp", "sms", "staff_alert"].map((c) => (
            <Link
              key={c ?? "all"}
              href={c ? `/staff/demo?channel=${c}` : "/staff/demo"}
              aria-current={channel === c ? "page" : undefined}
              className={cn(
                "min-h-9 rounded-full border px-3.5 py-1.5 text-sm",
                channel === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-foreground/40",
              )}
            >
              {c ? CHANNEL[c] : "All"}
            </Link>
          ))}
        </nav>
        <ul className="space-y-2">
          {rows.map(({ m, code, name, ownerId, staff }, i) => {
            const to =
              m.channel === "staff_alert"
                ? `To ${staff ?? "staff"}`
                : m.toPhone
                  ? `To ${seeAll || ownerId === viewer.id ? m.toPhone : maskPhone(m.toPhone)}`
                  : "";
            return (
              <li
                key={m.id}
                id={i === 0 ? "newest-message" : undefined}
                className={cn(
                  "scroll-mt-24 rounded-2xl border p-4",
                  m.status === "suppressed"
                    ? "border-dashed border-border bg-background"
                    : "border-border bg-card",
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-medium",
                      m.channel === "whatsapp"
                        ? "bg-sage-soft text-accent-foreground"
                        : m.channel === "sms"
                          ? "bg-secondary text-foreground"
                          : "bg-ochre-soft text-foreground",
                    )}
                  >
                    {CHANNEL[m.channel] ?? m.channel}
                  </span>
                  <span>{m.template.replace(/_/g, " ")}</span>
                  <span>{to}</span>
                  {code && (
                    <Link
                      href={`/staff/leads/${code}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {name ?? code}
                    </Link>
                  )}
                  <span className="tabular ml-auto">{ago(m.createdAt, now)}</span>
                </div>
                {m.status === "suppressed" ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Not sent:{" "}
                    {m.suppressedReason === "opted_out"
                      ? "the buyer opted out"
                      : "no consent to message"}
                    .
                  </p>
                ) : (
                  <p
                    className={cn(
                      "mt-2 text-sm leading-relaxed",
                      m.template === "otp" && "font-mono",
                    )}
                  >
                    {m.body}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
