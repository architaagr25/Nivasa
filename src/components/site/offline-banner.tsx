"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { WifiOff } from "lucide-react";

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** Hill and highway signal drops out; say so instead of letting taps silently fail. */
export function OfflineBanner() {
  const t = useTranslations("states");
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      {t("offline")}
    </div>
  );
}
