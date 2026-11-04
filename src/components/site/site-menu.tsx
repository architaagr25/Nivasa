"use client";

import NextLink from "next/link";
import { Dialog } from "radix-ui";
import {
  ArrowRight,
  Briefcase,
  CalendarCheck,
  ChevronRight,
  Menu,
  MessageCircle,
  X,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";

type Labels = {
  menu: string;
  close: string;
  projects: string;
  ask: string;
  book: string;
  myVisits: string;
  privacy: string;
  staff: string;
  language: string;
};

/** The phone and tablet menu: every buyer page, both projects, and the way in for staff. */
export function SiteMenu({
  labels,
  projects,
}: {
  labels: Labels;
  projects: { id: string; name: string; locality: string }[];
}) {
  const row =
    "flex min-h-12 items-center gap-3 rounded-xl px-3 text-base transition-colors hover:bg-secondary";

  return (
    <Dialog.Root>
      <Dialog.Trigger
        className="flex size-11 items-center justify-center rounded-full border border-border bg-card lg:hidden"
        aria-label={labels.menu}
      >
        <Menu className="size-5" aria-hidden />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(22rem,calc(100vw-2.5rem))] flex-col overflow-y-auto bg-background shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-border/60 px-5">
            <Dialog.Title className="font-heading text-2xl font-normal">Nivasa</Dialog.Title>
            <Dialog.Description className="sr-only">{labels.menu}</Dialog.Description>
            <Dialog.Close
              className="flex size-11 items-center justify-center rounded-full hover:bg-secondary"
              aria-label={labels.close}
            >
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>

          <nav className="flex-1 space-y-6 px-3 py-5" aria-label={labels.menu}>
            <section>
              <h2 className="px-3 pb-1 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                {labels.projects}
              </h2>
              <ul>
                {projects.map((p) => (
                  <li key={p.id}>
                    <Dialog.Close asChild>
                      <Link href={`/projects/${p.id}`} className={row}>
                        <span className="flex-1">
                          {p.name}
                          <span className="block text-xs text-muted-foreground">{p.locality}</span>
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                      </Link>
                    </Dialog.Close>
                  </li>
                ))}
              </ul>
            </section>

            <ul className="space-y-1">
              <li>
                <Dialog.Close asChild>
                  <Link href="/chat" className={row}>
                    <MessageCircle className="size-5 text-muted-foreground" aria-hidden />
                    {labels.ask}
                  </Link>
                </Dialog.Close>
              </li>
              <li>
                <Dialog.Close asChild>
                  <Link href="/visits" className={row}>
                    <CalendarCheck className="size-5 text-muted-foreground" aria-hidden />
                    {labels.myVisits}
                  </Link>
                </Dialog.Close>
              </li>
              <li className="pt-2">
                <Dialog.Close asChild>
                  <Link
                    href="/book"
                    className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-medium text-primary-foreground"
                  >
                    {labels.book}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Dialog.Close>
              </li>
            </ul>

            <div className="flex items-center justify-between gap-3 px-3">
              <span className="text-sm text-muted-foreground">{labels.language}</span>
              <LanguageSwitcher label={labels.language} />
            </div>
          </nav>

          <div className="space-y-1 border-t border-border/60 px-3 py-4 text-sm">
            <Dialog.Close asChild>
              <Link href="/privacy" className={`${row} text-sm text-muted-foreground`}>
                {labels.privacy}
              </Link>
            </Dialog.Close>
            <Dialog.Close asChild>
              <NextLink href="/staff" className={`${row} text-sm text-muted-foreground`}>
                <Briefcase className="size-4" aria-hidden />
                {labels.staff}
              </NextLink>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
