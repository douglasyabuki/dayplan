import { seedWorkspace } from "../../lib/workspace/seed";
import { expect, test } from "./fixtures";

test("Settings Data confirms clear, preserves the guest profile and preferences, and stays empty after reload", async ({
  page,
}) => {
  const initial = {
    ...seedWorkspace(),
    theme: "dark",
    timezone: "America/Sao_Paulo",
  };
  await page.addInitScript((snapshot) => {
    if (sessionStorage.getItem("clear-data-seeded")) return;
    localStorage.setItem("dayplan.onboarding.v1", "complete");
    localStorage.setItem("dayplan.workspace.v2", JSON.stringify(snapshot));
    localStorage.setItem(
      "dayplan.guest-profile.v1",
      JSON.stringify({ name: "Taylor" }),
    );
    sessionStorage.setItem("clear-data-seeded", "true");
  }, initial);
  await page.goto("/today");
  const openData = async () => {
    await page
      .getByRole("button", { name: /^Account and workspace settings for/ })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    const settings = page.getByRole("dialog", {
      name: "Settings",
      exact: true,
    });
    await settings.getByRole("button", { name: "Data", exact: true }).click();
    await settings
      .getByRole("button", { name: "Clear data", exact: true })
      .click();
    return page.getByRole("dialog", {
      name: "Clear your workspace data?",
      exact: true,
    });
  };
  let confirmation = await openData();
  await expect(confirmation).toBeVisible();
  await expect(
    confirmation.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("dayplan.workspace.v2")!),
    ),
  ).toEqual(initial);
  confirmation = await openData();
  await confirmation
    .getByRole("button", { name: "Clear data", exact: true })
    .click();
  await expect(confirmation).not.toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("dayplan.workspace.v2")!).tasks
            .length,
      ),
    )
    .toBe(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("dayplan.workspace.v2")!),
  );
  expect(saved).toMatchObject({
    tasks: [],
    projects: [],
    tags: [],
    sections: [],
    layouts: {},
    exceptions: {},
    theme: "dark",
    timezone: "America/Sao_Paulo",
  });
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("dayplan.guest-profile.v1")!),
    ),
  ).toEqual({ name: "Taylor" });
  await page.reload();
  await expect(
    page
      .getByRole("button", {
        name: /^Account and workspace settings for Taylor/,
      })
      .first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("dayplan.workspace.v2")!).tasks,
    ),
  ).toEqual([]);
});
