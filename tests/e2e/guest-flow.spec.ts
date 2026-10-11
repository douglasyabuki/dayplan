import { expect, type Page, test } from "@playwright/test";

const onboardingKey = "dayplan.onboarding.v1";
const workspaceKey = "dayplan.workspace.v2";
const profileKey = "dayplan.guest-profile.v1";
const workspace = {
  version: 2,
  tasks: [],
  projects: [],
  tags: [],
  sections: [],
  layouts: {},
  exceptions: {},
  timezone: "UTC",
  theme: "light",
};

async function returningGuest(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("dayplan.onboarding.v1", "complete"),
  );
  await page.goto("/today");
  await expect(
    page
      .getByRole("button", { name: /^Account and workspace settings for/ })
      .first(),
  ).toBeVisible();
}

async function openAccount(page: Page) {
  await page
    .getByRole("button", { name: /^Account and workspace settings for/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(
    dialog.getByRole("textbox", { name: "Name", exact: true }),
  ).toBeVisible();
  return dialog;
}

test("first root visit offers guest entry with keyboard focus and leaves storage untouched before Continue", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome to Dayplan" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Create an account/ }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: /Sign in/ })).toBeDisabled();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), workspaceKey),
  ).toBeNull();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), onboardingKey),
  ).toBeNull();
  await expect(
    page.getByRole("button", { name: "Continue without an account" }),
  ).toBeEnabled();
  // The Next.js development toolbar precedes the page in document tab order.
  await page
    .getByRole("button", { name: "Continue without an account" })
    .focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Continue without an account" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole("navigation", { name: "Workspace controls" }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), onboardingKey),
  ).toBe("complete");
  await page.reload();
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole("navigation", { name: "Workspace controls" }).first(),
  ).toBeVisible();
});

test("first deep link preserves query and fragment, including an existing guest workspace", async ({
  page,
}) => {
  await page.addInitScript(
    ({ workspaceKey, workspace }) => {
      if (!localStorage.getItem(workspaceKey))
        localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    },
    { workspaceKey, workspace },
  );
  await page.goto("/tasks?group=priority&sort=title#task");
  await expect(page).toHaveURL(/\/welcome\?next=/);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      workspaceKey,
    ),
  ).toEqual(workspace);
  await page
    .getByRole("button", { name: "Continue without an account" })
    .click();
  await expect(page).toHaveURL(/\/tasks\?group=priority&sort=title#task$/);
  await expect(
    page.getByRole("navigation", { name: "Workspace controls" }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      workspaceKey,
    ),
  ).toEqual(workspace);
});

test("returning guests can enter deep links or explicitly revisit welcome", async ({
  page,
}) => {
  await returningGuest(page);
  await page.goto("/calendar?mode=day&date=2026-10-10#calendar");
  await expect(
    page.getByRole("navigation", { name: "Workspace controls" }).first(),
  ).toBeVisible();
  await expect(page).toHaveURL(
    /\/calendar\?mode=day&date=2026-10-10#calendar$/,
  );
  await page.goto("/welcome");
  await expect(
    page.getByRole("heading", { name: "Welcome to Dayplan" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue without an account" })
    .click();
  await expect(page).toHaveURL(/\/today$/);
});

for (const destination of [
  "https://evil.test/inbox",
  "javascript:alert(1)",
  "/welcome",
]) {
  test(`unsafe welcome destination ${destination} falls back to Today`, async ({
    page,
  }) => {
    await page.goto(`/welcome?next=${encodeURIComponent(destination)}`);
    await page
      .getByRole("button", { name: "Continue without an account" })
      .click();
    await expect(page).toHaveURL(/\/today$/);
  });
}

test("unavailable storage permits session-only guest access and navigation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Blocked");
    };
  });
  await page.goto("/inbox?sort=title");
  await expect(
    page.getByText("Browser storage is unavailable.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue without an account" })
    .click();
  await expect(page).toHaveURL(/\/inbox\?sort=title$/);
  await expect(
    page.getByText("Session only · storage unavailable"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Today", exact: true }).first().click();
  await expect(page).toHaveURL(/\/today$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/inbox\?sort=title$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/today$/);
});

test("welcome replacement preserves ordinary back and forward navigation", async ({
  page,
}) => {
  await page.goto("/inbox");
  await page
    .getByRole("button", { name: "Continue without an account" })
    .click();
  await expect(page).toHaveURL(/\/inbox$/);
  await page.getByRole("link", { name: "Today", exact: true }).first().click();
  await expect(page).toHaveURL(/\/today$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/inbox$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/today$/);
});

test("guest Account settings migrate only a saved name and preserve save/cancel and focus behavior", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("profile-seeded")) {
      localStorage.setItem(
        "dayplan.account.v1",
        JSON.stringify({ name: "Taylor", email: "mock@example.com" }),
      );
      sessionStorage.setItem("profile-seeded", "true");
    }
  });
  await returningGuest(page);
  let dialog = await openAccount(page);
  const input = dialog.getByRole("textbox", { name: "Name", exact: true });
  await expect(input).toHaveValue("Taylor");
  await expect(
    dialog.getByText("No account-associated email", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Change password" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Delete account", exact: true }),
  ).toBeDisabled();
  await input.fill("  New name  ");
  await input.press("Enter");
  await expect(dialog.getByText("Name saved.", { exact: true })).toBeVisible();
  await expect(input).toHaveValue("New name");
  await input.fill("Discard me");
  await input.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .getByRole("button", {
        name: "Account and workspace settings for New name",
        exact: true,
      })
      .first(),
  ).toBeFocused();
  dialog = await openAccount(page);
  await expect(
    dialog.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("New name");
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Panel switch");
  await dialog.getByRole("button", { name: "Appearance", exact: true }).click();
  await dialog.getByRole("button", { name: "Account", exact: true }).click();
  await expect(
    dialog.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Panel switch");
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Normal close");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  dialog = await openAccount(page);
  await expect(
    dialog.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Normal close");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      profileKey,
    ),
  ).toEqual({ name: "Normal close" });
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("dayplan.account.v1")!),
    ),
  ).toEqual({ name: "Taylor", email: "mock@example.com" });
});

test("guest name validation and composition Escape keep the original cancellation semantics", async ({
  page,
}) => {
  await returningGuest(page);
  const dialog = await openAccount(page);
  const input = dialog.getByRole("textbox", { name: "Name", exact: true });
  await input.fill(" ");
  await input.press("Enter");
  await expect(
    dialog.getByText("Enter a name.", { exact: true }),
  ).toBeVisible();
  await input.fill("Composing");
  await input.evaluate((element) => {
    element.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
      }),
    );
  });
  await expect(dialog).toBeVisible();
  await input.evaluate((element) =>
    element.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true }),
    ),
  );
  await input.press("Escape");
  await expect(dialog).not.toBeVisible();
  const reopened = await openAccount(page);
  await expect(
    reopened.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Guest");
});

test("profile write failures preserve a usable name for the current session", async ({
  page,
}) => {
  await returningGuest(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "dayplan.guest-profile.v1") throw new Error("Quota");
      original.call(this, key, value);
    };
  });
  const dialog = await openAccount(page);
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Session name");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).press("Tab");
  await expect(
    dialog.getByText("Updated for this session.", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  const reopened = await openAccount(page);
  await expect(
    reopened.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Session name");
});
