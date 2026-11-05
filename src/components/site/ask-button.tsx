"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Pages that are already a conversation or a form; a floating button would only cover them.
const HIDDEN = ["/chat", "/book"];

/**
 * A way back to the chat from anywhere on the buyer site. It waits until the page has been
 * scrolled, since every page already offers the chat near the top.
 */
export function AskButton({ label }: { label: string }) {
  const pathname = usePathname();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (HIDDEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  // From a project page the chat opens already talking about that project.
  const project = pathname.match(/^\/projects\/([^/]+)/)?.[1];

  return (
    <Link
      href={{ pathname: "/chat", query: project ? { project } : {} }}
      aria-hidden={!shown}
      tabIndex={shown ? undefined : -1}
      className={cn(
        "fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-lg transition-all duration-300 hover:opacity-90 sm:right-6 sm:bottom-6",
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <MessageCircle className="size-4" aria-hidden />
      {label}
    </Link>
  );
}
