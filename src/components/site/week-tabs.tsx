"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Day = { key: string; label: string; slots: { id: string; time: string; left: string }[] };

export function WeekTabs({ days, query }: { days: Day[]; query?: Record<string, string> }) {
  const [active, setActive] = useState(days[0]?.key);
  const day = days.find((d) => d.key === active) ?? days[0];

  return (
    <div className="space-y-5">
      <div role="tablist" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map((d) => {
          const [weekday, ...rest] = d.label.split(/,\s*/);
          const selected = d.key === day.key;
          return (
            <button
              key={d.key}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`slots-${d.key}`}
              onClick={() => setActive(d.key)}
              className={cn(
                "flex min-w-20 shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-sm transition-colors",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-foreground/40",
              )}
            >
              <span className={cn("text-xs", !selected && "text-muted-foreground")}>{weekday}</span>
              <span className="font-medium">{rest.join(" ")}</span>
            </button>
          );
        })}
      </div>
      <div id={`slots-${day.key}`} role="tabpanel" aria-label={day.label}>
        <ul className="flex flex-wrap gap-2">
          {day.slots.map((s) => (
            <li key={s.id}>
              <Link
                href={{ pathname: "/book", query: { ...query, slot: s.id } }}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm transition-colors hover:border-foreground/40 hover:bg-secondary"
              >
                <span className="font-medium">{s.time}</span>
                <span className="text-xs text-sage">{s.left}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
