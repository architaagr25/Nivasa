"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("states");
  useEffect(() => console.error(error), [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-5 px-5 py-24 sm:px-8">
      <h1 className="text-4xl font-light">{t("errorTitle")}</h1>
      <p className="text-muted-foreground">{t("errorBody")}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="xl" onClick={reset}>
          {t("retry")}
        </Button>
        <Button asChild size="xl" variant="outline">
          <Link href="/">{t("home")}</Link>
        </Button>
      </div>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">{error.digest}</p>}
    </div>
  );
}
