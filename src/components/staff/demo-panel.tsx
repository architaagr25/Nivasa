"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Building2,
  Globe,
  Loader2,
  Megaphone,
  MessageCircleOff,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import { runRemindersNow, simulateLead, simulateReply } from "@/server/staff/intake-actions";

type Section = "lead" | "stop" | "reminders";
type Note = { tone: "good" | "bad"; text: React.ReactNode };

/**
 * On phones the outbox sits below these panels, so results offer a way down to it. It glides
 * to the newest message (the one just sent) and briefly rings it so the eye lands on it.
 */
function SeeOutbox() {
  const scroll = (e: React.MouseEvent) => {
    const target = document.getElementById("newest-message") ?? document.getElementById("outbox");
    if (!target) return;
    e.preventDefault();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    if (!still && target.id === "newest-message") {
      target.animate(
        [
          { boxShadow: "0 0 0 0 transparent" },
          { boxShadow: "0 0 0 3px var(--ring)", offset: 0.25 },
          { boxShadow: "0 0 0 0 transparent" },
        ],
        { duration: 1600, delay: 350, easing: "ease-out" },
      );
    }
  };
  return (
    <a
      href="#outbox"
      onClick={scroll}
      className="ml-1 font-medium whitespace-nowrap underline underline-offset-4 lg:hidden"
    >
      See the outbox ↓
    </a>
  );
}

function ActionButton({
  icon: Icon,
  label,
  spinning,
  disabled,
  onClick,
  type = "button",
}: {
  icon: LucideIcon;
  label: string;
  spinning: boolean;
  disabled: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <Button type={type} variant="outline" size="lg" disabled={disabled} onClick={onClick}>
      {spinning ? (
        <Loader2 className="animate-spin" data-icon="inline-start" />
      ) : (
        <Icon data-icon="inline-start" />
      )}
      {label}
    </Button>
  );
}

function Result({ note }: { note?: Note }) {
  if (!note) return null;
  return (
    <p
      role="status"
      className={cn(
        "rounded-xl px-4 py-3 text-sm",
        note.tone === "bad" ? "bg-clay-soft text-destructive" : "bg-sage-soft",
      )}
    >
      {note.text}
    </p>
  );
}

export function DemoPanel() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [active, setActive] = useState<string | null>(null);
  const [notes, setNotes] = useState<Partial<Record<Section, Note>>>({});
  const [consent, setConsent] = useState(true);
  const [language, setLanguage] = useState<"en" | "hi" | "gu">("en");
  const [replyPhone, setReplyPhone] = useState("");

  // Each result appears inside the panel whose button was pressed, right under it, so it is
  // visible without scrolling on any screen size.
  const run = (section: Section, key: string, fn: () => Promise<Note>) => {
    setActive(key);
    setNotes((n) => ({ ...n, [section]: undefined }));
    start(async () => {
      const note = await fn();
      setNotes((n) => ({ ...n, [section]: note }));
      setActive(null);
      router.refresh();
    });
  };

  const lead = (source: "property_portal" | "social_ad" | "website") =>
    run("lead", source, async () => {
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
              ? "First reply sent on WhatsApp straight away."
              : r.firstReply === "suppressed"
                ? "No message: this number has opted out."
                : "No message sent: no consent, so it waits for a call."}
            {r.possibleDuplicates > 0 && ` Flagged ${r.possibleDuplicates} possible duplicate(s).`}
            <SeeOutbox />
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
          <ActionButton
            spinning={active === "property_portal"}
            disabled={busy}
            icon={Building2}
            label="Property portal"
            onClick={() => lead("property_portal")}
          />
          <ActionButton
            spinning={active === "social_ad"}
            disabled={busy}
            icon={Megaphone}
            label="Social media ad"
            onClick={() => lead("social_ad")}
          />
          <ActionButton
            spinning={active === "website"}
            disabled={busy}
            icon={Globe}
            label="Website form"
            onClick={() => lead("website")}
          />
        </div>
        <Result note={notes.lead} />
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
            run("stop", "stop", async () => {
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
            aria-label="Mobile number that replied"
            inputMode="numeric"
            className="h-10 max-w-56"
          />
          <ActionButton
            spinning={active === "stop"}
            icon={MessageCircleOff}
            label="Reply STOP"
            type="submit"
            disabled={busy || !replyPhone}
          />
        </form>
        <Result note={notes.stop} />
      </section>

      <section className={card}>
        <h2 className="text-lg font-normal">Send due reminders now</h2>
        <p className="text-sm text-muted-foreground">
          In production this runs every minute. Running it twice never sends anything twice.
        </p>
        <ActionButton
          spinning={active === "reminders"}
          disabled={busy}
          icon={BellRing}
          label="Run reminder job"
          onClick={() =>
            run("reminders", "reminders", async () => {
              const r = await runRemindersNow();
              return r.ok
                ? {
                    tone: "good",
                    text: (
                      <>
                        {r.sent} sent, {r.skipped} skipped, {r.cancelled} cancelled.
                        {r.sent > 0 && <SeeOutbox />}
                      </>
                    ),
                  }
                : { tone: "bad", text: r.error };
            })
          }
        />
        <Result note={notes.reminders} />
      </section>
    </div>
  );
}
