"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { cancelMyVisit } from "@/server/actions/buyer";

export function CancelVisitButton({ code }: { code: string }) {
  const t = useTranslations("pass");
  const tb = useTranslations("book");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="xl"
          className="text-destructive hover:text-destructive sm:flex-1"
        >
          {t("cancel")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("cancel")}</AlertDialogTitle>
          <AlertDialogDescription>{t("cancelConfirm")}</AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {tb("error")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              const res = await cancelMyVisit(code);
              setBusy(false);
              if (!res.ok) return setFailed(true);
              router.refresh();
            }}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {busy && <Loader2 className="animate-spin" data-icon="inline-start" />}
            {t("cancel")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
