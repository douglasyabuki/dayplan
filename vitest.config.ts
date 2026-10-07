// vitest.config.ts
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],

  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["**/*.unit.test.{ts,tsx}"],
          environment: "node",
        },
      },

      {
        extends: true,
        test: {
          name: "browser",
          include: ["**/*.browser.test.tsx"],

          browser: {
            enabled: true,
            provider: playwright({
              launchOptions: {
                channel: "chrome",
              },
            }),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
