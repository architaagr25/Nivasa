import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("states");
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-5 px-5 py-24 sm:px-8">
      <p className="font-heading text-7xl font-light text-muted-foreground/60">404</p>
      <h1 className="text-4xl font-light">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("notFoundBody")}</p>
      <Button asChild size="xl">
        <Link href="/">{t("home")}</Link>
      </Button>
    </div>
  );
}
