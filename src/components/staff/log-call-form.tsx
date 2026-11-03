"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/hooks/use-hydrated";
import type { IngestResult } from "@/server/leads/ingest";
import { logHoardingCall } from "@/server/staff/intake-actions";

const select = "h-11 w-full rounded-lg border border-input bg-card px-3 text-sm";

export function LogCallForm() {
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<IngestResult | null>(null);
  const [consent, setConsent] = useState(false);

  if (done) {
    return (
      <div className="space-y-4 rounded-2xl bg-sage-soft p-6">
        <p className="flex items-center gap-2 text-lg">
          <CircleCheck className="size-5 text-sage" aria-hidden />
          {done.outcome === "merged" ? "Added to an existing lead" : "Lead created"}
        </p>
        <p className="text-sm text-accent-foreground/80">
          {done.outcome === "merged"
            ? "This number already had a lead, so the call was added to its history instead of creating a duplicate."
            : "The call counts as the first response."}
          {done.possibleDuplicates > 0 &&
            ` It looks like ${done.possibleDuplicates} other lead${done.possibleDuplicates > 1 ? "s" : ""} — check the possible-duplicate note on the lead.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href={`/staff/leads/${done.code}`}>Open {done.code}</Link>
          </Button>
          <Button variant="outline" size="lg" onClick={() => setDone(null)}>
            Log another call
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-5 rounded-2xl border border-border bg-card p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const budget = Number(f.get("budget"));
        start(async () => {
          setError(null);
          const res = await logHoardingCall({
            name: String(f.get("name") ?? ""),
            phone: String(f.get("phone") ?? ""),
            projectId: (f.get("project") as "project-1" | "project-2") || null,
            wantsBhk: (f.get("bhk") as "2BHK" | "3BHK") || null,
            budgetLakh: budget > 0 ? budget : null,
            language: (f.get("language") as "en" | "hi" | "gu") ?? "en",
            note: String(f.get("note") ?? ""),
            consent,
          });
          if (res.ok) setDone(res.result);
          else setError(res.error);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Caller&apos;s name</Label>
          <Input id="name" name="name" required className="h-11" autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Mobile number</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            required
            className="h-11"
            placeholder="98765 43210"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project">Project</Label>
          <select id="project" name="project" className={select} defaultValue="">
            <option value="">Not sure yet</option>
            <option value="project-1">Project 1</option>
            <option value="project-2">Project 2</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bhk">Home</Label>
          <select id="bhk" name="bhk" className={select} defaultValue="">
            <option value="">Not sure yet</option>
            <option value="2BHK">2 BHK</option>
            <option value="3BHK">3 BHK</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="budget">Budget (lakh, optional)</Label>
          <Input id="budget" name="budget" type="number" min={10} max={1000} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="language">Prefers</Label>
          <select id="language" name="language" className={select} defaultValue="gu">
            <option value="gu">Gujarati</option>
            <option value="hi">Hindi</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">What did they ask? (optional)</Label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={500}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
        />
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-secondary/70 p-4 text-sm leading-relaxed">
        <Checkbox
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
          className="mt-0.5"
        />
        <span>
          The caller agreed on the call to be contacted on WhatsApp or SMS about this enquiry. Leave
          unticked if they didn&apos;t; we will then only call them back.
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="xl" disabled={pending || !hydrated}>
        {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
        Save call
      </Button>
    </form>
  );
}
