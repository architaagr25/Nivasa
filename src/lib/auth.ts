import "server-only";
import { createHmac } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { normalisePhone } from "@/lib/phone";
import { recordOutbound } from "@/server/messaging/outbox";

export const DEMO_OTP_COOKIE = "nivasa_demo_otp";

/** Ties a simulated text message to the browser that asked for it. */
export function demoOtpProof(phone: string, outboxId: string) {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
    .update(`${phone}:${outboxId}`)
    .digest("base64url");
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // Staff accounts are created by the sales head (or the seed), never by public sign-up.
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  // Kept in the database so every server instance counts the same requests. Sending a code and
  // signing in get tighter limits than the rest.
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 30,
    customRules: {
      "/sign-in/email": { window: 300, max: 10 },
      "/phone-number/send-otp": { window: 600, max: 5 },
      "/phone-number/verify": { window: 600, max: 10 },
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "buyer", input: false },
    },
  },
  plugins: [
    // Buyers sign in with their mobile number. Delivery is simulated: the code is
    // written to the message outbox, which the demo shows in place of a real SMS.
    phoneNumber({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 3,
      phoneNumberValidator: (value) => normalisePhone(value) !== null,
      sendOTP: async ({ phoneNumber: to, code }, ctx) => {
        // However many addresses ask, one number gets at most five codes an hour.
        const [sent] = await db
          .select({ n: count() })
          .from(schema.outbox)
          .where(
            and(
              eq(schema.outbox.template, "otp"),
              eq(schema.outbox.toPhone, to),
              gt(schema.outbox.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
            ),
          );
        if (sent.n >= 5) {
          throw new APIError("TOO_MANY_REQUESTS", {
            message: "Too many codes for this number. Please try again in an hour.",
          });
        }
        const row = await recordOutbound({
          channel: "sms",
          template: "otp",
          toPhone: to,
          // Staff can read the outbox, so outside the demo (where the outbox stands in for the
          // SMS gateway) the stored copy never holds the code itself.
          body: `${process.env.DEMO_MODE === "true" ? code : "••••••"} is your Nivasa verification code. It expires in 5 minutes. Do not share it.`,
          transactional: true,
        });
        // Demo builds show the code on screen. This cookie lets only the browser that asked
        // for it read it back, so nobody can fetch the code for someone else's number.
        if (process.env.DEMO_MODE === "true" && ctx) {
          ctx.setCookie(DEMO_OTP_COOKIE, demoOtpProof(to, row.id), {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 300,
            path: "/api/demo",
          });
        }
      },
      signUpOnVerification: {
        getTempEmail: (value) => `${value.replace(/\D/g, "")}@buyer.nivasa.invalid`,
        getTempName: () => "Home buyer",
      },
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type Role = "buyer" | "sales_exec" | "sales_head";
