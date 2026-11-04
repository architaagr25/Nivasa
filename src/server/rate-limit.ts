import "server-only";
import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimit, requestLimits } from "@/db/schema";

/**
 * Who is asking, as far as a limit is concerned: the visitor's address as the hosting platform
 * reports it, hashed with the app secret so the address itself is never stored.
 */
export function visitorKey(headers: Headers) {
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
  return createHash("sha256")
    .update(`${process.env.BETTER_AUTH_SECRET}:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

/** Counts one request against `key` in the current window. False once `max` has been used up. */
export async function allow(key: string, max: number, windowSeconds: number) {
  const [row] = await db
    .insert(requestLimits)
    .values({
      key,
      windowStart: sql`to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds})`,
      hits: 1,
    })
    .onConflictDoUpdate({
      target: [requestLimits.key, requestLimits.windowStart],
      set: { hits: sql`${requestLimits.hits} + 1` },
    })
    .returning({ hits: requestLimits.hits });
  return row.hits <= max;
}

/** Old windows are of no use once they have passed. Run from the minute job. */
export async function pruneLimits() {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  await db.delete(requestLimits).where(lt(requestLimits.windowStart, new Date(dayAgo)));
  await db.delete(rateLimit).where(lt(rateLimit.lastRequest, dayAgo));
}
