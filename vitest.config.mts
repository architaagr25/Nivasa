import { config } from "dotenv";
import { defineConfig } from "vitest/config";
import path from "node:path";

config({ path: ".env.local", quiet: true });

// Integration tests need a real Postgres. Without one (a fresh clone, or CI without the
// secret) only the unit tests run, rather than everything failing on a connection error.
const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);
if (!hasTestDb) console.warn("TEST_DATABASE_URL is not set: skipping integration tests.");

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // server-only throws outside the React server runtime; tests run in plain Node.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", ...(hasTestDb ? ["tests/integration/**/*.test.ts"] : [])],
    setupFiles: ["tests/setup.ts"],
    // Integration tests share one test database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    passWithNoTests: true,
  },
});
