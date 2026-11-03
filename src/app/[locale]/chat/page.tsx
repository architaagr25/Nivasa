import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Chat } from "@/components/chat/chat";
import type { Locale } from "@/i18n/routing";
import { listProjects } from "@/server/projects/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/chat">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chat" });
  return { title: t("title"), robots: { index: false } };
}

export default function ChatPage(props: PageProps<"/[locale]/chat">) {
  return (
    <Suspense fallback={<div className="h-[calc(100dvh-4rem)] animate-pulse bg-muted/40" />}>
      <ChatContent {...props} />
    </Suspense>
  );
}

async function ChatContent({ params, searchParams }: PageProps<"/[locale]/chat">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const [sp, projects] = await Promise.all([searchParams, listProjects()]);
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

  const projectId = projects.some((p) => p.id === one(sp.project)) ? one(sp.project)! : null;
  const question = one(sp.q)?.slice(0, 800);
  const intent = one(sp.intent) === "book" ? "book" : one(sp.person) ? "person" : undefined;

  return (
    <Chat
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      projectId={projectId}
      initial={{ question, intent }}
      demo={process.env.DEMO_MODE === "true"}
    />
  );
}
