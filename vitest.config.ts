// vitest.config.ts
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  // Prebundle browser dependencies together to avoid mid-test reloads and
  // duplicate React instances when settings/onboarding first load.
  optimizeDeps: {
    include: [
      "react",
      "react-dom/client",
      "react/jsx-runtime",
      "vitest-browser-react",
      "@base-ui/react/input",
      "@base-ui/react/separator",
      "@base-ui/react/avatar",
      "@base-ui/react/select",
      "@base-ui/react/popover",
      "@base-ui/react/toggle",
      "@base-ui/react/toggle-group",
      "react-day-picker",
      "next/navigation",
    ],
  },

  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.unit.test.{ts,tsx}"],
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
