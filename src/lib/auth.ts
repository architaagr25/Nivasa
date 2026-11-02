import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { normalisePhone } from "@/lib/phone";
import { recordOutbound } from "@/server/messaging/outbox";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // Staff accounts are created by the sales head (or the seed), never by public sign-up.
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, window: 60, max: 30 },
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
      sendOTP: async ({ phoneNumber: to, code }) => {
        await recordOutbound({
          channel: "sms",
          template: "otp",
          toPhone: to,
          body: `${code} is your Nivasa verification code. It expires in 5 minutes. Do not share it.`,
          transactional: true,
        });
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
