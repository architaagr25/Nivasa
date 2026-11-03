"use client";

import { useState, useTransition } from "react";
import { Bot, Languages, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { translateConversation } from "@/server/staff/actions";

type Lang = "en" | "hi" | "gu";
type Item = {
  id: string;
  role: "buyer" | "assistant" | "staff" | "system";
  content: string;
  time: string;
  meta: string;
  translations: Partial<Record<Lang, string>>;
};

const OPTIONS: { key: "original" | Lang; label: string; lang?: string }[] = [
  { key: "original", label: "Original" },
  { key: "en", label: "English", lang: "en" },
  { key: "hi", label: "हिन्दी", lang: "hi" },
  { key: "gu", label: "ગુજરાતી", lang: "gu" },
];

export function Transcript({ leadCode, items }: { leadCode: string; items: Item[] }) {
  const [view, setView] = useState<"original" | Lang>("original");
  const [cache, setCache] = useState(() => {
    const c: Record<Lang, Record<string, string>> = { en: {}, hi: {}, gu: {} };
    for (const m of items)
      for (const [l, t] of Object.entries(m.translations)) c[l as Lang][m.id] = t;
    return c;
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choose = (key: "original" | Lang) => {
    setNotice(null);
    setView(key);
    if (key === "original") return;
    const missing = items.some((m) => !cache[key][m.id]);
    if (!missing) return;
    start(async () => {
      const res = await translateConversation(leadCode, key);
      if (!res.ok) {
        setNotice("Couldn't translate this conversation. Showing the original.");
        setView("original");
        return;
      }
      setCache((c) => ({ ...c, [key]: { ...c[key], ...res.translations } }));
      if (res.failed) {
        setNotice(
          `${res.failed} message${res.failed > 1 ? "s" : ""} couldn't be translated reliably and ${res.failed > 1 ? "are" : "is"} shown in the original.`,
        );
      }
    });
  };

  const textOf = (m: Item) => (view === "original" ? m.content : (cache[view][m.id] ?? m.content));
  const translated = (m: Item) =>
    view !== "original" && cache[view][m.id] && cache[view][m.id] !== m.content;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Show conversation in"
          className="flex rounded-full border border-border bg-background p-0.5"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              lang={o.lang}
              aria-pressed={view === o.key}
              disabled={pending}
              onClick={() => choose(o.key)}
              className={cn(
                "min-h-8 rounded-full px-3 text-xs font-medium transition-colors disabled:opacity-60",
                view === o.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {pending ? (
          <span
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
            role="status"
          >
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Translating…
          </span>
        ) : view !== "original" ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Languages className="size-3.5" aria-hidden /> Translated by AI · the original is the
            record
          </span>
        ) : null}
      </div>

      {notice && (
        <p role="alert" className="rounded-lg bg-ochre-soft px-3 py-2 text-xs">
          {notice}
        </p>
      )}

      <ol
        className={cn(
          "max-h-[28rem] space-y-3 overflow-y-auto pr-1 transition-opacity",
          pending && "opacity-60",
        )}
      >
        {items.map((m) => (
          <li key={m.id} className={cn("flex gap-2", m.role === "buyer" && "flex-row-reverse")}>
            {m.role !== "buyer" && (
              <Bot className="mt-1 size-4 shrink-0 text-muted-foreground" aria-label="Assistant" />
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                m.role === "buyer" ? "bg-primary text-primary-foreground" : "bg-secondary",
              )}
            >
              <p className="whitespace-pre-line" lang={view === "original" ? undefined : view}>
                {textOf(m)}
              </p>
              <p
                className={cn(
                  "mt-1 text-[0.68rem]",
                  m.role === "buyer" ? "opacity-70" : "text-muted-foreground",
                )}
              >
                {m.time}
                {m.meta}
                {translated(m) && " · translated"}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
