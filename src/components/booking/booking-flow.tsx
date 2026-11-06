"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { confirmBooking, type BookResult } from "@/server/actions/buyer";
import { cn } from "@/lib/utils";
import { PhoneOtp } from "./phone-otp";

type Props = {
  slot: {
    id: string;
    day: string;
    time: string;
    projectId: string;
    projectName: string;
    locality: string;
  };
  signedInPhone: string | null;
  defaultName: string;
  demo: boolean;
  reschedule?: { code: string; from: string };
};

export function BookingFlow({ slot, signedInPhone, defaultName, demo, reschedule }: Props) {
  const t = useTranslations("book");
  const locale = useLocale() as "en" | "hi" | "gu";
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(defaultName);
  const [consent, setConsent] = useState(false);
  const [phone, setPhone] = useState(signedInPhone);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Extract<BookResult, { ok: false }> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function detailsValid() {
    if (name.trim().length < 2) {
      setFormError(t("nameNeeded"));
      return false;
    }
    if (!reschedule && !consent) {
      setFormError(t("consentNeeded"));
      return false;
    }
    setFormError(null);
    return true;
  }

  async function book() {
    setBusy(true);
    setProblem(null);
    const res = await confirmBooking({
      slotId: slot.id,
      name: name.trim(),
      consent,
      locale,
      rescheduleCode: reschedule?.code,
    });
    if (res.ok) {
      router.push(`/visits/${res.code}`);
      return;
    }
    setBusy(false);
    if (res.error === "auth") setPhone(null);
    else setProblem(res);
  }

  const steps = [t("s1"), t("s2"), t("s3")];

  return (
    <div className="space-y-8">
      {/* Progress as a fluid bar rather than labelled circles, so it fits a 280px screen
          in any language; the current step is named in words above it. */}
      <div className="space-y-2.5">
        <p className="text-sm">
          <span className="text-muted-foreground">{t("step", { n: step })}</span>
          <span aria-hidden> · </span>
          <span className="font-medium">{steps[step - 1]}</span>
        </p>
        <ol className="grid grid-cols-3 gap-1.5">
          {steps.map((label, i) => (
            <li key={label} aria-current={i + 1 === step ? "step" : undefined}>
              <span className="sr-only">{label}</span>
              <span
                aria-hidden
                className={cn(
                  "block h-1 rounded-full transition-colors",
                  i + 1 <= step ? "bg-primary" : "bg-border",
                )}
              />
            </li>
          ))}
        </ol>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6">
        <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {t("yourVisit")}
        </p>
        {reschedule && (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("reschedulingFrom", { time: reschedule.from })}
          </p>
        )}
        <p className="mt-3 font-heading text-3xl font-light">{slot.time}</p>
        <p className="mt-1 flex items-center gap-2 text-muted-foreground">
          <CalendarDays className="size-4" aria-hidden /> {slot.day}
        </p>
        <p className="mt-1 flex items-center gap-2 text-muted-foreground">
          <MapPin className="size-4" aria-hidden /> {slot.projectName}, {slot.locality}
        </p>
        {step === 1 && (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button size="xl" onClick={() => setStep(2)} className="sm:flex-1">
              {t("continue")}
            </Button>
            <Button asChild size="xl" variant="outline" className="sm:flex-1">
              <Link href={`/projects/${slot.projectId}#visit`}>{t("changeTime")}</Link>
            </Button>
          </div>
        )}
      </section>

      {step === 2 && (
        <section className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("name")}</Label>
            <Input
              id="name"
              autoComplete="name"
              placeholder={t("namePh")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 text-base"
            />
          </div>

          {!reschedule && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-secondary/70 p-4 text-sm leading-relaxed">
              <Checkbox
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                className="mt-0.5"
                aria-describedby="consent-text"
              />
              <span id="consent-text">
                {t("consent")}{" "}
                <Link href="/privacy" className="underline underline-offset-4">
                  ↗
                </Link>
              </span>
            </label>
          )}
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}

          {phone ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("signedInAs", { phone: `+91 ${phone.slice(3, 8)} ${phone.slice(8)}` })}{" "}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={async () => {
                    await authClient.signOut();
                    setPhone(null);
                    router.refresh();
                  }}
                >
                  {t("notYou")}
                </button>
              </p>
              <Button
                size="xl"
                className="w-full"
                disabled={busy}
                onClick={() => detailsValid() && book()}
              >
                {busy && <Loader2 className="animate-spin" data-icon="inline-start" />}
                {busy ? t("booking") : t("confirm")}
              </Button>
            </div>
          ) : (
            <PhoneOtp
              demo={demo}
              beforeSend={detailsValid}
              onVerified={book}
              verifyLabel={t("verify")}
            />
          )}

          {problem && <Problem problem={problem} />}
        </section>
      )}
    </div>
  );
}

function Problem({ problem }: { problem: Extract<BookResult, { ok: false }> }) {
  const t = useTranslations("book");
  if (problem.error === "already_booked") {
    return (
      <div role="alert" className="rounded-xl bg-ochre-soft p-4 text-sm">
        <p>{t("already")}</p>
        {problem.existingCode && (
          <Link
            href={`/visits/${problem.existingCode}`}
            className="mt-2 inline-block font-medium underline underline-offset-4"
          >
            {t("viewIt")}
          </Link>
        )}
      </div>
    );
  }
  if (
    (problem.error === "slot_full" || problem.error === "too_soon") &&
    problem.alternatives?.length
  ) {
    return (
      <div role="alert" className="space-y-3 rounded-xl bg-ochre-soft p-4 text-sm">
        <p>{problem.error === "too_soon" ? t("tooSoon") : t("taken")}</p>
        <ul className="flex flex-wrap gap-2">
          {problem.alternatives.map((a) => (
            <li key={a.id}>
              <Link
                href={{ pathname: "/book", query: { slot: a.id } }}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 hover:border-foreground/40"
              >
                {a.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <p role="alert" className="rounded-xl bg-clay-soft p-4 text-sm text-destructive">
      {t("error")}
    </p>
  );
}
