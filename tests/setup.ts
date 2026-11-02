import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

// Tests must never touch the live database.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
}
