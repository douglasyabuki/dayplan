import { emptyWorkspace } from "../../lib/workspace/empty";
import { expect, type Page, test } from "./fixtures";

async function account(page: Page, theme: "light" | "dark") {
  const date = new Date().toISOString();
  const snapshot = { ...emptyWorkspace("UTC"), theme };
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: {
        session: {
          id: "connection-session",
          userId: "connection-user",
          token: "test",
          createdAt: date,
          updatedAt: date,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        user: {
          id: "connection-user",
          name: "Taylor",
          email: "taylor@example.test",
          emailVerified: true,
          image: null,
          createdAt: date,
          updatedAt: date,
        },
      },
    }),
  );
  await page.route("**/api/profile", (route) =>
    route.fulfill({ json: { name: "Taylor", email: "taylor@example.test" } }),
  );
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ json: { snapshot, revision: 1 } }),
  );
  await page.route("**/api/auth-options", (route) =>
    route.fulfill({ json: { google: true, github: true } }),
  );
  await page.route("**/api/auth/list-accounts", (route) =>
    route.fulfill({
      json: [
        { id: "google-record", providerId: "google" },
        { id: "github-record", providerId: "github" },
      ],
    }),
  );
}

for (const [width, height, theme] of [
  [1280, 900, "light"],
  [390, 844, "dark"],
] as const) {
  test(`connection return opens Account settings and fits ${width}px ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await account(page, theme);
    await page.goto(
      "/inbox?sort=title&settings=account&connection=success&provider=github#task",
    );
    const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        "GitHub connected. You can now sign in with Google or GitHub.",
      ),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/inbox\?sort=title#task$/);
    await expect(
      dialog.getByRole("button", { name: "Disconnect GitHub" }),
    ).toBeEnabled();
    await expect(
      dialog.getByRole("button", { name: "Switch account" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Change password" }),
    ).toHaveCount(0);
    const box = await dialog.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(width);
    expect(box!.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: info.outputPath("account-settings.png") });
    await dialog.getByRole("button", { name: "Disconnect GitHub" }).click();
    await expect(
      page.getByRole("dialog", { name: "Disconnect GitHub?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
}

test("both sign-in choices show the selected loading state and prevent duplicate requests", async ({
  page,
}) => {
  await page.route("**/api/auth-options", (route) =>
    route.fulfill({ json: { google: true, github: true } }),
  );
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/sign-in/social", async (route) => {
    await waiting;
    await route.fulfill({ status: 503, json: { message: "Unavailable" } });
  });
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Continue with GitHub" }).click();
  await expect(
    page.getByRole("button", { name: "Connecting to GitHub…" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeDisabled();
  release();
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeEnabled();
});

for (const width of [1280, 390]) {
  test(`sign-in choices fit ${width}px and have supporting icons`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/api/auth-options", (route) =>
      route.fulfill({ json: { google: true, github: true } }),
    );
    await page.goto("/sign-in");
    for (const name of ["Google", "GitHub"]) {
      const button = page.getByRole("button", {
        name: `Continue with ${name}`,
      });
      await expect(button).toBeEnabled();
      await expect(button.locator('svg[data-icon="inline-start"]')).toHaveCount(
        1,
      );
    }
    await page.screenshot({ path: info.outputPath("sign-in.png") });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Continue with Google" }).focus();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "Continue with GitHub" }),
    ).toBeFocused();
  });
}

test("expired connection sessions return to sign-in with an Account settings destination", async ({
  page,
}) => {
  await page.route("**/api/auth-options", (route) =>
    route.fulfill({ json: { google: true, github: true } }),
  );
  await page.goto(
    "/inbox?sort=title&settings=account&connection=error&provider=github&error=unauthorized#task",
  );
  await expect(
    page.getByRole("alert", { name: "Sign-in error" }),
  ).toContainText("Please sign in again");
  const url = new URL(page.url());
  expect(url.pathname).toBe("/sign-in");
  expect(url.searchParams.get("next")).toBe(
    "/inbox?sort=title&settings=account#task",
  );
});
