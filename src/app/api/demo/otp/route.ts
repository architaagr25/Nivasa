import { and, desc, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { outbox } from "@/db/schema";
import { normalisePhone } from "@/lib/phone";

// Demo builds have no SMS gateway, so the booking screen reads the code from the simulated
// outbox and shows it. With DEMO_MODE off this route does not exist.
export async function GET(request: Request) {
  if (process.env.DEMO_MODE !== "true") return new NextResponse(null, { status: 404 });

  const phone = normalisePhone(new URL(request.url).searchParams.get("phone"));
  if (!phone) return NextResponse.json({ code: null });

  const [latest] = await db
    .select({ body: outbox.body })
    .from(outbox)
    .where(
      and(
        eq(outbox.template, "otp"),
        eq(outbox.toPhone, phone),
        gt(outbox.createdAt, new Date(Date.now() - 5 * 60 * 1000)),
      ),
    )
    .orderBy(desc(outbox.createdAt))
    .limit(1);
  return NextResponse.json({ code: latest?.body.match(/^\d{6}/)?.[0] ?? null });
}
