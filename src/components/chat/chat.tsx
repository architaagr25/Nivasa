"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowUp,
  CalendarCheck,
  CircleCheck,
  Loader2,
  PhoneCall,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneOtp } from "@/components/booking/phone-otp";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { ChatMessage, MessagePart } from "@/server/assistant/conversation";

type Action =
  | { type: "slots"; projectId: string }
  | { type: "book"; slotId: string }
  | { type: "human" }
  | { type: "reschedule"; slotId: string };

type Props = {
  projects: { id: string; name: string }[];
  projectId: string | null;
  initial: { question?: string; intent?: "book" | "person" };
  demo: boolean;
};

export function Chat({ projects, projectId, initial, demo }: Props) {
  const t = useTranslations("chat");
  const locale = useLocale() as "en" | "hi" | "gu";
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<{ message?: string; action?: Action } | null>(null);
  const [verifiedHere, setVerifiedHere] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const send = useCallback(
    async (payload: { message?: string; action?: Action }) => {
      setBusy(true);
      setFailed(null);
      if (payload.message) {
        // Show the buyer's words straight away; the server's copy replaces it.
        setMessages((m) => [
          ...(m ?? []),
          {
            id: "pending",
            role: "buyer",
            text: payload.message!,
            parts: [],
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locale, projectId, ...payload }),
        });
        const data = (await res.json()) as { messages?: ChatMessage[] };
        if (!res.ok && res.status !== 429) throw new Error(String(res.status));
        setMessages((m) => [
          ...(m ?? []).filter((x) => x.id !== "pending"),
          ...(data.messages ?? []),
        ]);
      } catch {
        setMessages((m) => (m ?? []).filter((x) => x.id !== "pending"));
        setFailed(payload);
        if (payload.message) setDraft(payload.message);
      } finally {
        setBusy(false);
      }
    },
    [locale, projectId],
  );

  // Load the conversation, then act on how the buyer arrived (a question, "book", "person").
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const res = await fetch("/api/chat").catch(() => null);
      const data = res?.ok ? ((await res.json()) as { messages: ChatMessage[] }) : { messages: [] };
      setMessages(data.messages);
      if (initial.question) await send({ message: initial.question });
      else if (initial.intent === "person") await send({ action: { type: "human" } });
      else if (initial.intent === "book" && projectId)
        await send({ action: { type: "slots", projectId } });
    })();
  }, [initial, projectId, send]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    send({ message: text });
  };

  const lastVerifyId = [...(messages ?? [])]
    .reverse()
    .find((m) => m.parts.some((p) => p.type === "verify"))?.id;
  const showWelcome = messages !== null && messages.length === 0 && !busy;
  const pickProject =
    messages !== null && messages.length === 0 && initial.intent === "book" && !projectId;

  return (
    <div data-fullscreen className="flex h-[calc(100dvh-4rem)] flex-col">
      <div className="border-b border-border bg-background/80">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-normal">{t("title")}</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">{t("lead")}</p>
          </div>
          <Button
            variant="outline"
            size="lg"
            className="shrink-0 rounded-full"
            disabled={busy}
            onClick={() => send({ action: { type: "human" } })}
          >
            <UserRound data-icon="inline-start" />
            <span className="hidden min-[380px]:inline">{t("person")}</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" aria-live="polite" aria-busy={busy}>
        <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6">
          {messages === null && (
            <div className="space-y-3" aria-hidden>
              <div className="h-16 w-3/4 animate-pulse rounded-2xl bg-muted" />
              <div className="ml-auto h-10 w-1/2 animate-pulse rounded-2xl bg-muted" />
            </div>
          )}

          {showWelcome && (
            <div className="space-y-5 py-6">
              <div className="space-y-2">
                <p className="font-heading text-3xl font-light">{t("welcomeTitle")}</p>
                <p className="text-muted-foreground">{t("welcomeBody")}</p>
              </div>
              {pickProject ? (
                <div className="space-y-2">
                  <p className="text-sm">{t("pickProject")}</p>
                  <div className="flex flex-wrap gap-2">
                    {projects.map((p) => (
                      <Chip
                        key={p.id}
                        onClick={() => send({ action: { type: "slots", projectId: p.id } })}
                      >
                        {t("visitProject", { name: p.name })}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(["s1", "s2", "s4"] as const).map((k) => (
                    <Chip key={k} onClick={() => send({ message: t(k) })}>
                      {t(k)}
                    </Chip>
                  ))}
                  {projects.map((p) => (
                    <Chip
                      key={p.id}
                      onClick={() => send({ action: { type: "slots", projectId: p.id } })}
                    >
                      {t("visitProject", { name: p.name })}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages?.map((m) => (
            <Message
              key={m.id}
              message={m}
              busy={busy}
              onAction={(a) => send({ action: a })}
              verifyOpen={m.id === lastVerifyId && !verifiedHere}
              onVerified={async (consent, pending) => {
                await fetch("/api/chat", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ locale, action: { type: "verified", consent } }),
                });
                setVerifiedHere(true);
                await send({ action: pending });
              }}
              demo={demo}
            />
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Avatar />
              <span className="flex gap-1" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </span>
              <span className="sr-only">{t("typing")}</span>
            </div>
          )}

          {failed && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-xl bg-clay-soft px-4 py-3 text-sm"
            >
              <span>{t("failed")}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraft("");
                  send(failed);
                }}
              >
                <RotateCcw data-icon="inline-start" /> {t("retry")}
              </Button>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-border bg-background">
        <form
          className="mx-auto flex max-w-2xl items-end gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            {t("placeholder")}
          </label>
          <textarea
            id="chat-input"
            rows={1}
            maxLength={800}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t("placeholder")}
            className="field-sizing-content max-h-36 min-h-12 flex-1 resize-none rounded-2xl border border-input bg-card px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
          <Button
            type="submit"
            size="icon-lg"
            className="size-12 shrink-0 rounded-full"
            disabled={busy || !draft.trim()}
            aria-label={t("send")}
          >
            {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </form>
        <p className="mx-auto max-w-2xl px-4 pb-2 text-[0.7rem] leading-snug text-muted-foreground sm:px-6">
          {t("aiNote")}
        </p>
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-sm text-primary-foreground"
    >
      N
    </span>
  );
}

function Chip({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm transition-colors hover:border-foreground/40 hover:bg-secondary",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Message({
  message,
  busy,
  onAction,
  verifyOpen,
  onVerified,
  demo,
}: {
  message: ChatMessage;
  busy: boolean;
  onAction: (a: Action) => void;
  verifyOpen: boolean;
  onVerified: (consent: boolean, pending: Action) => Promise<void>;
  demo: boolean;
}) {
  const t = useTranslations("chat");
  if (message.role === "system") {
    return <p className="text-center text-xs text-muted-foreground">{message.text}</p>;
  }
  if (message.role === "buyer") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 whitespace-pre-line text-primary-foreground">
          {message.text}
        </p>
      </div>
    );
  }

  const citations = message.parts.find(
    (p): p is Extract<MessagePart, { type: "citations" }> => p.type === "citations",
  );
  return (
    <div className="flex gap-2.5">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-3">
        {message.text && (
          <div className="rounded-2xl rounded-tl-md bg-card px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.03)] ring-1 ring-border">
            <p className="leading-relaxed whitespace-pre-line">{message.text}</p>
            {citations && (
              <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                <span>{t("source")}:</span>
                {citations.facts.map((f) => (
                  <span
                    key={f.code}
                    title={f.code}
                    className="rounded-full bg-sage-soft px-2 py-0.5 text-accent-foreground"
                  >
                    {f.label}
                  </span>
                ))}
              </p>
            )}
          </div>
        )}

        {message.parts.map((p, i) => {
          if (p.type === "slots") {
            return (
              <div key={i} className="space-y-2">
                <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                  {p.projectName}
                </p>
                <div className="flex flex-wrap gap-2">
                  {p.slots.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={busy}
                      onClick={() => onAction({ type: "book", slotId: s.id })}
                      className="inline-flex min-h-11 flex-col items-start justify-center rounded-xl border border-border bg-card px-3.5 py-1.5 text-left text-sm transition-colors hover:border-foreground/40 hover:bg-secondary disabled:opacity-60"
                    >
                      <span className="font-medium">{s.time}</span>
                      <span className="text-xs text-muted-foreground">{s.day}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          if (p.type === "booked") {
            return (
              <div key={i} className="rounded-2xl bg-sage-soft p-4">
                <p className="flex items-center gap-2 font-medium text-accent-foreground">
                  <CalendarCheck className="size-4" aria-hidden /> {t("booked")}
                </p>
                <p className="mt-1 text-sm">
                  {p.projectName} · {p.label}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("meet", { name: p.executiveName })}
                </p>
                <Button asChild size="lg" className="mt-3">
                  <Link href={`/visits/${p.code}`}>{t("viewPass")}</Link>
                </Button>
              </div>
            );
          }
          if (p.type === "existing") {
            return (
              <div key={i} className="space-y-3 rounded-2xl border border-border bg-card p-4">
                <p className="flex items-center gap-2 font-medium">
                  <CalendarCheck className="size-4 text-sage" aria-hidden /> {t("existingTitle")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {p.projectName} · {p.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="lg"
                    className="h-auto min-h-11 py-2 whitespace-normal"
                    disabled={busy}
                    onClick={() => onAction({ type: "reschedule", slotId: p.newSlotId })}
                  >
                    {t("moveTo", { time: p.newLabel })}
                  </Button>
                  <Button asChild size="lg" variant="outline" className="min-h-11">
                    <Link href={`/visits/${p.code}`}>{t("viewPass")}</Link>
                  </Button>
                </div>
              </div>
            );
          }
          if (p.type === "handoff") {
            return (
              <div key={i} className="flex gap-3 rounded-2xl bg-secondary/80 p-4">
                <PhoneCall className="mt-0.5 size-4 shrink-0 text-sage" aria-hidden />
                <div>
                  <p className="font-medium">{t("handoffTitle")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("handoffBody", { name: p.executiveName })}
                  </p>
                </div>
              </div>
            );
          }
          if (p.type === "verify") {
            return verifyOpen ? (
              <VerifyCard
                key={i}
                purpose={p.purpose}
                demo={demo}
                onDone={(consent) =>
                  onVerified(
                    consent,
                    p.purpose === "book" && p.slotId
                      ? { type: "book", slotId: p.slotId }
                      : { type: "human" },
                  )
                }
              />
            ) : null;
          }
          return null;
        })}
      </div>
    </div>
  );
}

function VerifyCard({
  purpose,
  demo,
  onDone,
}: {
  purpose: "book" | "handoff";
  demo: boolean;
  onDone: (consent: boolean) => Promise<void>;
}) {
  const t = useTranslations("chat");
  const tb = useTranslations("book");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 font-medium">
        <CircleCheck className="size-4 text-sage" aria-hidden />
        {purpose === "book" ? t("verifyBook") : t("verifyHandoff")}
      </p>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-secondary/70 p-3 text-sm leading-relaxed">
        <Checkbox
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
          className="mt-0.5"
        />
        <span>{tb("consent")}</span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <PhoneOtp
        demo={demo}
        verifyLabel={tb("verify")}
        beforeSend={() => {
          if (!consent) setError(tb("consentNeeded"));
          return consent;
        }}
        onVerified={() => onDone(consent)}
      />
    </div>
  );
}
