import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Integration tests share one test database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    passWithNoTests: true,
  },
});
