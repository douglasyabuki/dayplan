import { emptyWorkspace } from "../../lib/workspace/empty";
import { seedWorkspace } from "../../lib/workspace/seed";
import type { Workspace } from "../../types-and-constants/workspace";
import { expect, type Page, test } from "./fixtures";

async function signedInAccount(page: Page) {
  let snapshot: Workspace = {
    ...emptyWorkspace("Pacific/Auckland"),
    theme: "dark",
  };
  let revision = 1;
  const writes: Workspace[] = [];
  const createdAt = new Date().toISOString();
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: {
        session: {
          id: "settings-session",
          userId: "settings-account",
          token: "test",
          createdAt,
          updatedAt: createdAt,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        user: {
          id: "settings-account",
          name: "Taylor",
          email: "taylor@example.com",
          emailVerified: true,
          image: null,
          createdAt,
          updatedAt: createdAt,
        },
      },
    }),
  );
  await page.route("**/api/profile", (route) =>
    route.fulfill({ json: { name: "Taylor", email: "taylor@example.com" } }),
  );
  await page.route("**/api/workspace", (route) => {
    if (route.request().method() === "PUT") {
      snapshot = route.request().postDataJSON().snapshot;
      writes.push(snapshot);
      revision++;
      return route.fulfill({
        json: { committedRevision: revision, currentRevision: revision },
      });
    }
    return route.fulfill({ json: { snapshot, revision } });
  });
  await page.route("**/api/workspace/import/preview", (route) =>
    route.fulfill({
      json: {
        alreadyImported: false,
        hasPriorImports: false,
        historyToken: "history",
      },
    }),
  );
  return { snapshot: () => snapshot, writes };
}

async function openSettings(page: Page) {
  await page
    .getByRole("button", { name: /^Account and workspace settings for Taylor/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  return page.getByRole("dialog", { name: "Settings", exact: true });
}

test("Data settings restores a JSON backup after closing Settings and confirming", async ({
  page,
}) => {
  const account = await signedInAccount(page);
  const backup = { ...seedWorkspace("UTC"), theme: "light" as const };
  await page.goto("/today");
  const settings = await openSettings(page);
  await settings.getByRole("button", { name: "Data", exact: true }).click();
  await settings.getByLabel("Backup file").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  const confirmation = page.getByRole("dialog", {
    name: "Restore backup?",
    exact: true,
  });
  await expect(settings).not.toBeVisible();
  await expect(confirmation).toBeVisible();
  await expect(
    confirmation.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  expect(account.writes).toHaveLength(0);
  await confirmation
    .getByRole("button", { name: "Restore backup", exact: true })
    .click();
  await expect.poll(() => account.snapshot()).toEqual(backup);
  await expect(
    page.getByText("Backup restored", { exact: true }),
  ).toBeVisible();
  await page.reload();
  const reopened = await openSettings(page);
  await reopened.getByRole("button", { name: "Data", exact: true }).click();
  await expect(
    reopened.getByText("Timezone: UTC", { exact: true }),
  ).toBeVisible();
  expect(account.snapshot()).toEqual(backup);
});

test("signed-in Data settings exports, confirms sample replacement, preserves preferences, and persists after reload", async ({
  page,
}) => {
  const account = await signedInAccount(page);
  await page.goto("/today");
  let settings = await openSettings(page);
  await settings.getByRole("button", { name: "Data", exact: true }).click();
  await expect(
    settings.getByRole("heading", { name: "Sample data", exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByText("Storage location: your account.", {
      exact: true,
    }),
  ).toBeVisible();
  await settings.screenshot({ path: "test-results/data-settings-desktop.png" });
  const downloading = page.waitForEvent("download");
  await settings
    .getByRole("button", { name: "Download backup", exact: true })
    .click();
  expect((await downloading).suggestedFilename()).toMatch(
    /^dayplan-workspace-.*\.json$/,
  );
  await settings
    .getByRole("button", { name: "Reset to sample data", exact: true })
    .click();
  let confirmation = page.getByRole("dialog", {
    name: "Reset to sample data?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await expect(settings).not.toBeVisible();
  await expect(confirmation).toContainText("in your account");
  await expect(
    confirmation.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(account.writes).toHaveLength(0);
  settings = await openSettings(page);
  await settings.getByRole("button", { name: "Data", exact: true }).click();
  await settings
    .getByRole("button", { name: "Reset to sample data", exact: true })
    .click();
  confirmation = page.getByRole("dialog", {
    name: "Reset to sample data?",
    exact: true,
  });
  await confirmation
    .getByRole("button", { name: "Reset to sample data", exact: true })
    .click();
  await expect.poll(() => account.snapshot().tasks.length).toBeGreaterThan(0);
  expect(account.snapshot()).toMatchObject({
    theme: "dark",
    timezone: "Pacific/Auckland",
  });
  expect(
    await page.evaluate(() => localStorage.getItem("dayplan.workspace.v2")),
  ).toBeNull();
  await page.reload();
  await expect(
    page
      .getByRole("button", {
        name: /^Account and workspace settings for Taylor/,
      })
      .first(),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  settings = await openSettings(page);
  await settings.getByRole("button", { name: "Data", exact: true }).click();
  await expect(
    settings.getByRole("button", { name: "Reset to sample data", exact: true }),
  ).toBeVisible();
  expect(
    await settings.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await settings.screenshot({ path: "test-results/data-settings-mobile.png" });
});

test("guest import is in Data rather than Account settings and nested cancellation preserves browser data", async ({
  page,
}) => {
  const guest = seedWorkspace();
  await signedInAccount(page);
  await page.addInitScript((snapshot) => {
    localStorage.setItem("dayplan.workspace.v2", JSON.stringify(snapshot));
    localStorage.setItem(
      "dayplan.guest-profile.v1",
      JSON.stringify({ name: "Old guest" }),
    );
  }, guest);
  await page.goto("/today");
  const startup = page.getByRole("dialog", {
    name: "Guest data available",
    exact: true,
  });
  await startup.getByRole("button", { name: "Close", exact: true }).click();
  const settings = await openSettings(page);
  await expect(
    settings.getByRole("button", { name: "Import guest data", exact: true }),
  ).toHaveCount(0);
  await settings.getByRole("button", { name: "Data", exact: true }).click();
  await expect(
    settings.getByRole("heading", {
      name: "Guest data available",
      exact: true,
    }),
  ).toBeVisible();
  await settings
    .getByRole("button", { name: "Import guest data", exact: true })
    .click();
  const preview = page.getByRole("dialog", {
    name: "Import guest data?",
    exact: true,
  });
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(settings).toBeVisible();
  await settings
    .getByRole("button", { name: "Discard guest data", exact: true })
    .click();
  const discard = page.getByRole("dialog", {
    name: "Discard guest data?",
    exact: true,
  });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("dayplan.workspace.v2")!),
    ),
  ).toEqual(guest);
  expect(
    await page.evaluate(() => localStorage.getItem("dayplan.guest-profile.v1")),
  ).toContain("Old guest");
});

test("signed-in avatar offers sign-out without guest sign-in or sign-up options", async ({
  page,
}) => {
  await signedInAccount(page);
  await page.goto("/today");
  await page
    .getByRole("button", { name: /^Account and workspace settings for Taylor/ })
    .first()
    .click();
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([
    "Settings",
    "Help and contact",
    "Sign out",
  ]);
});
