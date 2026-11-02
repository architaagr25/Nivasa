import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

async function main() {
  // `npm run db:migrate -- --test` migrates the separate test database instead.
  const target = process.argv.includes("--test") ? "TEST_DATABASE_URL" : "DIRECT_URL";
  const url = process.env[target];
  if (!url) throw new Error(`${target} is not set`);

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  await sql.end();
  console.log(`Migrated (${target})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
