"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { normalisePhone } from "@/lib/phone";

type Props = {
  demo: boolean;
  /** Runs after the code is verified and the session cookie is set. */
  onVerified: () => Promise<void> | void;
  /** Extra checks before a code is sent (e.g. name and consent on the booking form). */
  beforeSend?: () => boolean;
  verifyLabel: string;
};

export function PhoneOtp({ demo, onVerified, beforeSend, verifyLabel }: Props) {
  const t = useTranslations("book");
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    const e164 = normalisePhone(phone);
    if (!e164) return setError(t("invalidPhone"));
    if (beforeSend && !beforeSend()) return;
    setBusy(true);
    const res = await authClient.phoneNumber.sendOtp({ phoneNumber: e164 });
    setBusy(false);
    if (res.error) return setError(t("error"));
    setSentTo(e164);
    setCode("");
    if (demo) {
      const r = await fetch(`/api/demo/otp?phone=${encodeURIComponent(e164)}`);
      setDemoCode(((await r.json()) as { code: string | null }).code);
    }
  }

  async function verify() {
    if (!sentTo) return;
    setError(null);
    setBusy(true);
    const res = await authClient.phoneNumber.verify({ phoneNumber: sentTo, code });
    if (res.error) {
      setBusy(false);
      return setError(t("wrongCode"));
    }
    try {
      await onVerified();
    } finally {
      setBusy(false);
    }
  }

  if (!sentTo) {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="mobile">{t("mobile")}</Label>
          <div className="flex gap-2">
            <span className="flex h-12 items-center rounded-lg border border-input bg-secondary px-3 text-sm text-muted-foreground">
              +91
            </span>
            <Input
              id="mobile"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder={t("mobilePh")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              className="h-12 text-base"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "otp-error" : undefined}
            />
          </div>
        </div>
        {error && (
          <p id="otp-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button size="xl" className="w-full" onClick={send} disabled={busy}>
          {busy && <Loader2 className="animate-spin" data-icon="inline-start" />}
          {t("sendCode")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("codeSent", { phone: `+91 ${sentTo.slice(3, 8)} ${sentTo.slice(8)}` })}
      </p>
      {demoCode && (
        <p className="rounded-lg bg-ochre-soft px-3 py-2 text-sm" role="status">
          {t("demoCode", { code: demoCode })}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="otp">{t("code")}</Label>
        <Input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()}
          className="h-12 text-center font-mono text-lg tracking-[0.5em]"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "otp-error" : undefined}
          autoFocus
        />
      </div>
      {error && (
        <p id="otp-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button size="xl" className="w-full" onClick={verify} disabled={busy || code.length !== 6}>
        {busy && <Loader2 className="animate-spin" data-icon="inline-start" />}
        {verifyLabel}
      </Button>
      <button
        type="button"
        onClick={() => setSentTo(null)}
        className="min-h-11 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        {t("resend")}
      </button>
    </div>
  );
}
