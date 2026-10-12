import { test as base } from "@playwright/test";

export { expect, type Locator, type Page } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, providePage) => {
    // Guest UI tests should not depend on local auth settings or a database.
    // Account tests register their own session route after this default.
    await page.route("**/api/auth/get-session**", (route) =>
      route.fulfill({ json: null }),
    );
    await providePage(page);
  },
});
