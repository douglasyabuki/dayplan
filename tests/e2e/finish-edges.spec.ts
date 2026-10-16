import { emptyWorkspace } from "../../lib/workspace/empty";
import { expect, type Page, test } from "./fixtures";

async function account(page: Page) {
  let deleted = false;
  const requests: string[] = [];
  const now = new Date().toISOString();
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: deleted
        ? null
        : {
            session: {
              id: "edge-session",
              userId: "edge-user",
              token: "test",
              createdAt: new Date(Date.now() - 86_400_000).toISOString(),
              updatedAt: now,
              expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            },
            user: {
              id: "edge-user",
              name: "Taylor",
              email: "taylor@example.test",
              emailVerified: true,
              image: null,
              createdAt: now,
              updatedAt: now,
            },
          },
    }),
  );
  await page.route("**/api/profile", (route) =>
    route.fulfill({ json: { name: "Taylor", email: "taylor@example.test" } }),
  );
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ json: { snapshot: emptyWorkspace(), revision: 0 } }),
  );
  await page.route("**/api/auth/list-accounts", (route) =>
    route.fulfill({
      json: [
        {
          id: "google-account",
          providerId: "google",
          accountId: "identity",
          createdAt: now,
          updatedAt: now,
        },
      ],
    }),
  );
  await page.route("**/api/workspace/import/preview", (route) =>
    route.fulfill({
      json: {
        alreadyImported: false,
        hasPriorImports: false,
        historyToken: "history",
      },
    }),
  );
  await page.route("**/api/account", (route) => {
    const checkOnly = route.request().postDataJSON()?.checkOnly;
    requests.push(checkOnly ? "CHECK" : route.request().method());
    if (checkOnly) return route.fulfill({ json: { eligible: true } });
    if (route.request().method() === "POST")
      return route.fulfill({ json: { capability: "signed-status" } });
    if (route.request().method() === "DELETE") {
      deleted = true;
      return route.fulfill({ json: { deleted: true } });
    }
    return route.fulfill({ json: { deleted } });
  });
  return requests;
}

test("Help works without a workspace, and unknown pages offer usable navigation", async ({
  page,
}) => {
  await page.goto("/help");
  await expect(
    page.getByRole("heading", { name: "Help and contact" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Understand saving" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Contact support" }),
  ).toBeVisible();
  await page.goto("/this-page-does-not-exist");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeFocused();
  await page.getByRole("link", { name: "Help and contact" }).click();
  await expect(page).toHaveURL(/\/help$/);
});

test("missing project and tag IDs offer collection navigation without creation controls", async ({
  page,
}) => {
  await account(page);
  for (const kind of ["projects", "tags"]) {
    await page.goto(`/${kind}/missing`);
    await expect(
      page.getByRole("heading", {
        name: kind === "projects" ? "Project not found" : "Tag not found",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add task", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: `Back to ${kind}`, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${kind}$`));
  }
});

test("mobile save feedback remains visible with navigation closed", async ({
  page,
}) => {
  await account(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/today");
  const status = page.getByRole("button", {
    name: "Workspace sync: Saved",
    exact: true,
  });
  await expect(status).toBeVisible();
  await expect(status).toHaveText("Saved");
  await status.click();
  await expect(
    page.getByRole("button", { name: "Sync now", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("account deletion requires confirmation, offers backup, and preserves independent guest bytes", async ({
  page,
}) => {
  const requests = await account(page);
  await page.goto("/today?settings=account");
  await expect(
    page.getByRole("button", { name: /Change profile photo/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Delete your account permanently?",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  const submit = dialog.getByRole("button", {
    name: "Permanently delete account",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  const downloading = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download workspace backup" })
    .click();
  expect((await downloading).suggestedFilename()).toMatch(
    /^dayplan-workspace-.*\.json$/,
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(requests).toEqual(["CHECK"]);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) =>
        key.startsWith("dayplan.account-deletion.v1:"),
      ),
    ),
  ).toEqual([]);
  await page.evaluate(() =>
    localStorage.setItem("dayplan.guest-profile.v1", "guest bytes to preserve"),
  );
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await submit.click();
  await expect(page).toHaveURL(/\/welcome\?accountDeleted=1$/);
  expect(requests).toEqual(["CHECK", "CHECK", "POST", "DELETE"]);
  expect(
    await page.evaluate(() => localStorage.getItem("dayplan.guest-profile.v1")),
  ).toBe("guest bytes to preserve");
});

test("reauthentication return rejects a different account and never deletes automatically", async ({
  page,
}) => {
  const requests = await account(page);
  await page.addInitScript(() =>
    sessionStorage.setItem("dayplan.delete-reauth.v1", "different-user"),
  );
  await page.goto("/today?settings=account");
  const dialog = page.getByRole("dialog", {
    name: "Verify before deleting your account",
    exact: true,
  });
  await expect(dialog.getByText(/A different account signed in/)).toBeVisible();
  await expect(dialog.getByLabel("Type DELETE to confirm")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Permanently delete account" }),
  ).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("expired deletion session routes through sign-in and returns to fresh confirmation", async ({
  page,
}) => {
  await account(page);
  let attempts = 0;
  let verified = false;
  await page.route("**/api/account", (route) => {
    attempts++;
    if (verified) return route.fulfill({ json: { eligible: true } });
    return route.fulfill({
      status: 401,
      json: {
        code: "unauthorized",
        message: "Sign in again before deleting your account.",
      },
    });
  });
  await page.route("**/api/auth/sign-out", (route) =>
    route.fulfill({ json: { success: true } }),
  );
  await page.goto("/today?settings=account");
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Verify before deleting your account",
    exact: true,
  });
  await expect(dialog.getByLabel("Type DELETE to confirm")).toHaveCount(0);
  await expect(
    dialog.getByText("Sign in again before deleting your account."),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Sign in again", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  verified = true;
  await page.goto("/today?settings=account");
  dialog = page.getByRole("dialog", {
    name: "Delete your account permanently?",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "Download workspace backup" }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Type DELETE to confirm")).toHaveValue("");
  await expect(
    dialog.getByRole("button", {
      name: "Permanently delete account",
      exact: true,
    }),
  ).toBeDisabled();
  expect(attempts).toBe(2);
});

for (const expiredAt of ["POST", "DELETE"]) {
  test(`session expiry at ${expiredAt} during confirmation clears DELETE and requires sign-in`, async ({
    page,
  }) => {
    const requests = await account(page);
    await page.goto("/today?settings=account");
    await page
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Delete your account permanently?",
      exact: true,
    });
    await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.route("**/api/account", (route) => {
      requests.push(route.request().method());
      if (expiredAt === "DELETE" && route.request().method() === "POST")
        return route.fulfill({ json: { capability: "signed-status" } });
      return route.fulfill({
        status: 401,
        json: {
          code: "unauthorized",
          message: "Sign in again before deleting your account.",
        },
      });
    });
    await dialog
      .getByRole("button", { name: "Permanently delete account", exact: true })
      .click();
    const verify = page.getByRole("dialog", {
      name: "Verify before deleting your account",
      exact: true,
    });
    await expect(
      verify.getByRole("button", { name: "Sign in again", exact: true }),
    ).toBeVisible();
    await expect(verify.getByLabel("Type DELETE to confirm")).toHaveCount(0);
    expect(requests).toEqual(
      expiredAt === "POST" ? ["CHECK", "POST"] : ["CHECK", "POST", "DELETE"],
    );
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter((key) =>
          key.startsWith("dayplan.account-deletion.v1:"),
        ),
      ),
    ).toEqual([]);
    await verify.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.route("**/api/account", (route) =>
      route.fulfill({ json: { eligible: true } }),
    );
    await page
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    await expect(dialog.getByLabel("Type DELETE to confirm")).toHaveValue("");
  });
}

test("pending session checks prevent duplicate clicks and cancellation cannot open confirmation later", async ({
  page,
}) => {
  await account(page);
  let checks = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/account", async (route) => {
    checks++;
    await held;
    await route.fulfill({ json: { eligible: true } });
  });
  await page.goto("/today?settings=account");
  const trigger = page.getByRole("button", {
    name: "Delete account",
    exact: true,
    includeHidden: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Verify before deleting your account",
    exact: true,
  });
  await expect(dialog.getByRole("status")).toHaveText(
    "Checking deletion eligibility…",
  );
  await expect(trigger).toBeDisabled();
  await expect(dialog.getByLabel("Type DELETE to confirm")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  release();
  await expect(trigger).toBeEnabled();
  await expect(
    page.getByRole("dialog", {
      name: "Delete your account permanently?",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(checks).toBe(1);
  await trigger.click();
  await expect(page.getByLabel("Type DELETE to confirm")).toHaveValue("");
  expect(checks).toBe(2);
});

test("failed eligibility checks and failed sign-out preserve data and permit retry", async ({
  page,
}) => {
  const requests = await account(page);
  let stale = false;
  await page.route("**/api/account", (route) => {
    requests.push(
      route.request().postDataJSON()?.checkOnly
        ? "CHECK"
        : route.request().method(),
    );
    return route.fulfill({
      status: stale ? 401 : 503,
      json: {
        code: stale ? "unauthorized" : "storage_error",
        message: stale
          ? "Sign in again before deleting your account."
          : "Storage unavailable. Retry.",
      },
    });
  });
  await page.route("**/api/auth/sign-out", (route) =>
    route.fulfill({ status: 500, json: { message: "Sign-out failed" } }),
  );
  await page.goto("/today?settings=account");
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Verify before deleting your account",
    exact: true,
  });
  await expect(dialog.getByRole("alert")).toHaveText(
    "Storage unavailable. Retry.",
  );
  stale = true;
  await dialog.getByRole("button", { name: "Retry eligibility check" }).click();
  await dialog
    .getByRole("button", { name: "Sign in again", exact: true })
    .click();
  await expect(
    page.getByText(
      "Sign-out failed. Your account is still signed in. Please retry.",
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole("button", { name: "Delete account", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Sign in again", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Type DELETE to confirm")).toHaveCount(0);
  expect(requests).toEqual(["CHECK", "CHECK", "CHECK"]);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("dayplan.delete-reauth.v1"),
    ),
  ).toBeNull();
  await page.goto("/today?settings=account");
  await expect(
    page.getByRole("button", { name: "Delete account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", {
      name: "Verify before deleting your account",
      exact: true,
    }),
  ).toHaveCount(0);
});
