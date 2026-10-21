import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/**/*.test.js"],
    testTimeout: 120_000,
    fileParallelism: false,
    forbidOnly: Boolean(process.env.CI),
  },
});
