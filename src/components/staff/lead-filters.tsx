"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { SOURCE_LABEL, STATUS_LABEL } from "@/server/staff/labels";

type View = { key: string; label: string; count?: number };

export function LeadFilters({
  views,
  projects,
}: {
  views: View[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const id = setTimeout(() => set("q", q.trim() || null), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const view = params.get("view") ?? "all";
  const select = "h-10 rounded-lg border border-input bg-card px-3 text-sm";

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Views"
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
      >
        {views.map((v) => (
          <button
            key={v.key}
            role="tab"
            type="button"
            aria-selected={view === v.key}
            onClick={() => set("view", v.key === "all" ? null : v.key)}
            className={cn(
              "flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors",
              view === v.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:border-foreground/40",
            )}
          >
            {v.label}
            {v.count !== undefined && (
              <span className={cn("tabular text-xs", view !== v.key && "text-muted-foreground")}>
                {v.count}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">Search leads</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, LD code, email or mobile"
            className="h-10 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
        </label>
        <select
          aria-label="Source"
          className={select}
          value={params.get("source") ?? ""}
          onChange={(e) => set("source", e.target.value || null)}
        >
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          className={select}
          value={params.get("status") ?? ""}
          onChange={(e) => set("status", e.target.value || null)}
        >
          <option value="">Any status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Score"
          className={select}
          value={params.get("score") ?? ""}
          onChange={(e) => set("score", e.target.value || null)}
        >
          <option value="">Any score</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </select>
        <select
          aria-label="Project"
          className={select}
          value={params.get("project") ?? ""}
          onChange={(e) => set("project", e.target.value || null)}
        >
          <option value="">Both projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {pending && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />
        )}
      </div>
    </div>
  );
}

/** Re-fetches the page every 30 s so new leads show up without a reload. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-1.5 animate-pulse rounded-full bg-sage" aria-hidden /> Live
    </span>
  );
}
