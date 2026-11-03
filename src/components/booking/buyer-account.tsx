"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { setMyMessaging } from "@/server/actions/buyer";
import { PhoneOtp } from "./phone-otp";

export function BuyerSignIn({ demo }: { demo: boolean }) {
  const t = useTranslations("visits");
  const router = useRouter();
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <PhoneOtp demo={demo} verifyLabel={t("signIn")} onVerified={() => router.refresh()} />
    </div>
  );
}

/** Opt-out switch (DPDP: stopping messages must be as easy as agreeing to them) and sign out. */
export function BuyerAccount({ optedOut }: { optedOut: boolean }) {
  const t = useTranslations("visits");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-12 space-y-4 border-t border-border pt-6 text-sm">
      {optedOut && <p className="rounded-xl bg-secondary/70 p-4">{t("optedOut")}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="lg"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await setMyMessaging(optedOut);
            setBusy(false);
            router.refresh();
          }}
        >
          {optedOut ? t("optIn") : t("optOut")}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onClick={async () => {
            await authClient.signOut();
            router.refresh();
          }}
        >
          {t("signOut")}
        </Button>
      </div>
    </div>
  );
}
