import { expect, test } from "./fixtures";

test.describe("before hydration", () => {
  test.use({ javaScriptEnabled: false });

  test("Google sign-in is unavailable until the page is interactive", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    const signIn = page.getByRole("button", { name: "Continue with Google" });
    // Static production pages show their Suspense fallback before JavaScript;
    // dynamically rendered pages can already show the disabled button.
    await expect(
      signIn.or(
        page.getByRole("status").filter({ hasText: "Preparing sign in" }),
      ),
    ).toBeVisible();
    await expect(signIn.and(page.locator(":enabled"))).toHaveCount(0);
  });
});

test("Google sign-in preserves the destination, supports retry, and leaves guest data untouched", async ({
  page,
}) => {
  const destination = "/inbox?sort=title#task";
  await page.route("**/api/auth-options", (route) =>
    route.fulfill({ json: { google: true } }),
  );
  const attempts: unknown[] = [];
  await page.route("**/api/auth/sign-in/social", async (route) => {
    attempts.push(route.request().postDataJSON());
    await route.fulfill({
      status: 503,
      json: { message: "Temporarily unavailable" },
    });
  });
  await page.goto(`/welcome?next=${encodeURIComponent(destination)}`);
  await page
    .getByRole("link", { name: "Sign in", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(
    page.getByRole("alert", { name: "Google sign-in error" }),
  ).toContainText("Google sign-in could not start");
  expect(attempts[0]).toMatchObject({
    provider: "google",
    callbackURL: destination,
    errorCallbackURL: `/sign-in?authError=1&next=${encodeURIComponent(destination)}`,
  });
  await page.getByRole("link", { name: "Sign up", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("next")).toBe(destination);
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(
    page.getByRole("alert", { name: "Google sign-in error" }),
  ).toContainText("Google sign-in could not start");
  expect(attempts).toHaveLength(2);
  expect(
    await page.evaluate(() => localStorage.getItem("dayplan.onboarding.v1")),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("dayplan.workspace.v2")),
  ).toBeNull();
  await page.getByRole("link", { name: "Explore as a guest" }).click();
  await page
    .getByRole("button", { name: "Continue without an account" })
    .click();
  await expect(page).toHaveURL(/\/inbox\?sort=title#task$/);
});

test("OAuth errors allow retry and external return destinations are rejected", async ({
  page,
}) => {
  await page.route("**/api/auth-options", (route) =>
    route.fulfill({ json: { google: true } }),
  );
  let body: Record<string, string> | undefined;
  await page.route("**/api/auth/sign-in/social", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({
      status: 503,
      json: { message: "Temporarily unavailable" },
    });
  });
  await page.goto("/sign-in?authError=1&next=https%3A%2F%2Fexternal.test%2F");
  await expect(
    page.getByRole("alert", { name: "Google sign-in error" }),
  ).toContainText("Google sign-in was not completed");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(
    page.getByRole("alert", { name: "Google sign-in error" }),
  ).toContainText("Google sign-in could not start");
  expect(body?.callbackURL).toBe("/today");
});

test("unconfigured Google sign-in shows a recoverable error", async ({
  page,
}) => {
  await page.route("**/api/auth-options", (route) =>
    route.fulfill({ json: { google: false } }),
  );
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(
    page.getByRole("alert", { name: "Google sign-in error" }),
  ).toContainText("Google sign-in is not configured");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
});
