import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { LogCallForm } from "@/components/staff/log-call-form";
import { requireStaff } from "@/lib/session";

export const metadata: Metadata = { title: "Log a call" };

export default function LogCallPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <Link
        href="/staff/leads"
        className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> All leads
      </Link>
      <div>
        <h1 className="text-3xl font-light">Log a call</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For calls to the hoarding number. If the number already has a lead, the call is added to
          it.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
        <Guarded />
      </Suspense>
    </div>
  );
}

async function Guarded() {
  await requireStaff();
  return <LogCallForm />;
}
