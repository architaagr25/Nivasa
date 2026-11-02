import "server-only";
import { z } from "zod";

// Validated once at startup so a missing variable fails loudly instead of halfway through a request.
const schema = z.object({
  DATABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1),
  AI_FALLBACK_MODEL: z.string().min(1),
  CRON_SECRET: z.string().min(16),
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
});

export const env = schema.parse(process.env);
export const isDemo = env.DEMO_MODE === "true";
