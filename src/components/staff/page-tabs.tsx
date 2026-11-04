"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Tab = { key: string; label: string; href: string; count?: number };

/**
 * Tabs that switch the moment they're pressed. The page behind them is rendered on the server,
 * so without this the old tab would stay highlighted, and its content on screen, until the new
 * content arrived. Here the new tab lights up at once and a placeholder stands in meanwhile.
 */
export function PageTabs({
  tabs,
  current,
  label,
  fallback,
  children,
}: {
  tabs: Tab[];
  current: string;
  label: string;
  fallback: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState(current);
  const active = pending ? target : current;

  return (
    <>
      <nav className="flex gap-6 border-b border-border" aria-label={label}>
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              if (t.key === active) return;
              setTarget(t.key);
              start(() => router.push(t.href));
            }}
            aria-current={active === t.key ? "page" : undefined}
            className={cn(
              "-mb-px flex min-h-11 items-center gap-2 border-b-2 px-1 text-sm",
              active === t.key
                ? "border-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-xs",
                  t.count ? "bg-clay text-white" : "bg-secondary text-muted-foreground",
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        ))}
      </nav>
      {pending && target !== current ? <div aria-busy="true">{fallback}</div> : children}
    </>
  );
}
