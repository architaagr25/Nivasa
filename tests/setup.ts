import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

// Tests must never touch the live database.
if (process.env.TEST_DATABASE_URL) {
  // The app talks to Supabase through the transaction pooler (port 6543) in production, so the
  // tests do too. The session pooler on 5432 caps clients at 15, which the concurrency tests exceed.
  const url = new URL(process.env.TEST_DATABASE_URL);
  if (url.hostname.endsWith("pooler.supabase.com")) url.port = "6543";
  process.env.DATABASE_URL = url.toString();
  process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
}
