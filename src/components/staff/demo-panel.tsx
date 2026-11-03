"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, Building2, Globe, Loader2, Megaphone, MessageCircleOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import { runRemindersNow, simulateLead, simulateReply } from "@/server/staff/intake-actions";

type Note = { tone: "good" | "bad"; text: React.ReactNode } | null;

export function DemoPanel() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [consent, setConsent] = useState(true);
  const [language, setLanguage] = useState<"en" | "hi" | "gu">("en");
  const [note, setNote] = useState<Note>(null);
  const [replyPhone, setReplyPhone] = useState("");

  const run = (fn: () => Promise<Note>) =>
    start(async () => {
      setNote(await fn());
      router.refresh();
    });

  const lead = (source: "property_portal" | "social_ad" | "website") =>
    run(async () => {
      const res = await simulateLead(source, { consent, language });
      if (!res.ok) return { tone: "bad", text: res.error };
      const r = res.result;
      return {
        tone: "good",
        text: (
          <>
            <Link
              href={`/staff/leads/${r.code}`}
              className="font-medium underline underline-offset-4"
            >
              {r.code}
            </Link>{" "}
            {r.outcome === "created" ? "created" : "merged into an existing lead"}.{" "}
            {r.firstReply === "sent"
              ? "First reply sent on WhatsApp straight away (see the outbox)."
              : r.firstReply === "suppressed"
                ? "No message: this number has opted out."
                : "No message sent: no consent, so it waits for a call."}
            {r.possibleDuplicates > 0 && ` Flagged ${r.possibleDuplicates} possible duplicate(s).`}
          </>
        ),
      };
    });

  const busy = pending || !hydrated;
  const card = "space-y-3 rounded-2xl border border-border bg-card p-5";

  return (
    <div className="space-y-5">
      <section className={card}>
        <h2 className="text-lg font-normal">A new lead arrives</h2>
        <p className="text-sm text-muted-foreground">
          Sends a realistic lead through the same intake a portal or ad platform would use.
        </p>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            Buyer ticked consent
          </label>
          <label className="flex items-center gap-2">
            Language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "en" | "hi" | "gu")}
              className="h-9 rounded-lg border border-input bg-card px-2"
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="gu">Gujarati</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="lg"
            disabled={busy}
            onClick={() => lead("property_portal")}
          >
            <Building2 data-icon="inline-start" /> Property portal
          </Button>
          <Button variant="outline" size="lg" disabled={busy} onClick={() => lead("social_ad")}>
            <Megaphone data-icon="inline-start" /> Social media ad
          </Button>
          <Button variant="outline" size="lg" disabled={busy} onClick={() => lead("website")}>
            <Globe data-icon="inline-start" /> Website form
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Calls to the hoarding number are logged by staff:{" "}
          <Link href="/staff/leads/new" className="underline underline-offset-4">
            Log a call
          </Link>
          .
        </p>
      </section>

      <section className={card}>
        <h2 className="text-lg font-normal">A buyer replies STOP</h2>
        <p className="text-sm text-muted-foreground">
          Every lead with that number is opted out and no further messages go to it.
        </p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const res = await simulateReply(replyPhone, "STOP");
              return res.ok
                ? {
                    tone: "good",
                    text: `Opted out ${res.optedOut} lead${res.optedOut > 1 ? "s" : ""}. Reminders to them will now be skipped.`,
                  }
                : { tone: "bad", text: res.error };
            });
          }}
        >
          <Input
            value={replyPhone}
            onChange={(e) => setReplyPhone(e.target.value)}
            placeholder="Mobile number"
            inputMode="numeric"
            className="h-10 max-w-56"
          />
          <Button type="submit" variant="outline" size="lg" disabled={busy || !replyPhone}>
            <MessageCircleOff data-icon="inline-start" /> Reply STOP
          </Button>
        </form>
      </section>

      <section className={card}>
        <h2 className="text-lg font-normal">Send due reminders now</h2>
        <p className="text-sm text-muted-foreground">
          In production this runs every minute. Running it twice never sends anything twice.
        </p>
        <Button
          variant="outline"
          size="lg"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await runRemindersNow();
              return r.ok
                ? {
                    tone: "good",
                    text: `${r.sent} sent, ${r.skipped} skipped, ${r.cancelled} cancelled.`,
                  }
                : { tone: "bad", text: r.error };
            })
          }
        >
          <BellRing data-icon="inline-start" /> Run reminder job
        </Button>
      </section>

      {(note || pending) && (
        <p
          role="status"
          className={cn(
            "rounded-xl px-4 py-3 text-sm",
            note?.tone === "bad" ? "bg-clay-soft text-destructive" : "bg-sage-soft",
          )}
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Working…
            </span>
          ) : (
            note?.text
          )}
        </p>
      )}
    </div>
  );
}
