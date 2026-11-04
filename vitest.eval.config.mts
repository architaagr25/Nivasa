import { config } from "dotenv";
import { defineConfig } from "vitest/config";
import path from "node:path";

config({ path: ".env.local", quiet: true });

if (!process.env.TEST_DATABASE_URL) throw new Error("The assistant check needs TEST_DATABASE_URL.");
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) throw new Error("It also needs a Gemini API key.");

// The assistant check asks the real model, so it is kept out of `npm test` and run on purpose
// with `npm run eval`. It writes its results to docs/assistant-eval.md.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
      "next/cache": path.resolve(import.meta.dirname, "tests/stubs/next-cache.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/eval/**/*.eval.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
});
