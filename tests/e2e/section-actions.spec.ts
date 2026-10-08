import { expect, test } from "@playwright/test";

const key = "dayplan.workspace.v2";
async function seed(page: import("@playwright/test").Page, board: boolean) {
  await page.addInitScript(
    ({ key, board }) => {
      if (!sessionStorage.getItem("section-test-seeded")) {
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 2,
            tasks: [
              {
                id: "task",
                title: "Section task",
                parentId: null,
                description: "",
                projectId: null,
                sectionId: "section",
                tagIds: [],
                priority: "none",
                completed: false,
                archived: false,
                order: 0,
                createdAt: "2026-10-01",
              },
            ],
            exceptions: {},
            sections: [
              {
                id: "section",
                name: "Alpha section",
                projectId: null,
                order: 0,
              },
            ],
            projects: [{ id: "project", name: "Project", color: "sky" }],
            tags: [],
            layouts: { inbox: board ? "board" : "list" },
            timezone: "UTC",
            theme: "light",
          }),
        );
        sessionStorage.setItem("section-test-seeded", "true");
      }
    },
    { key, board },
  );
  await page.goto("/inbox");
  await expect(
    page.getByRole("button", { name: "Manage Alpha section" }),
  ).toBeVisible();
}

async function stored(page: import("@playwright/test").Page) {
  return page.evaluate(
    (storageKey) => JSON.parse(localStorage.getItem(storageKey)!),
    key,
  );
}

test("section dropdown adds sections on either side and moves section tasks", async ({
  page,
}) => {
  await seed(page, true);
  const button = page.getByRole("button", { name: "Manage Alpha section" });
  await button.click();
  const menu = page.locator('[data-slot="dropdown-menu-content"][data-open]');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("data-side", "right");
  await menu.getByRole("menuitem", { name: "Add Section to Left" }).click();
  await page.getByLabel("Section name").fill("Left section");
  await page.getByRole("button", { name: "Save" }).click();
  let workspace = await stored(page);
  let sections = workspace.sections.sort(
    (a: { order: number }, b: { order: number }) => a.order - b.order,
  );
  expect(sections.map((section: { name: string }) => section.name)).toEqual([
    "Left section",
    "Alpha section",
  ]);

  await button.click();
  await page
    .locator('[data-slot="dropdown-menu-content"][data-open]')
    .getByRole("menuitem", { name: "Add Section to Right" })
    .click();
  await page.getByLabel("Section name").fill("Right section");
  await page.getByRole("button", { name: "Save" }).click();
  workspace = await stored(page);
  sections = workspace.sections.sort(
    (a: { order: number }, b: { order: number }) => a.order - b.order,
  );
  expect(sections.map((section: { name: string }) => section.name)).toEqual([
    "Left section",
    "Alpha section",
    "Right section",
  ]);

  await button.click();
  await page
    .locator('[data-slot="dropdown-menu-content"][data-open]')
    .getByRole("menuitem", { name: "Move to" })
    .hover();
  await expect(
    page
      .getByRole("menuitemcheckbox", { name: "Inbox", exact: true })
      .locator("svg.lucide-inbox"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("menuitemcheckbox", { name: "Project", exact: true })
      .locator('svg[data-color="sky"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Inbox", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("menuitemcheckbox", { name: "Project", exact: true })
    .click();
  workspace = await stored(page);
  expect(
    workspace.sections.find(
      (section: { id: string }) => section.id === "section",
    ).projectId,
  ).toBe("project");
  expect(
    workspace.tasks.find((task: { id: string }) => task.id === "task"),
  ).toMatchObject({
    projectId: "project",
    sectionId: "section",
  });
});

test("section header context menu mirrors actions in list layout", async ({
  page,
}) => {
  await seed(page, false);
  await page.locator("[data-section-header-menu]").click({ button: "right" });
  const menu = page.locator('[data-slot="context-menu-content"][data-open]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Add Section to Left" }),
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Add Section to Right" }),
  ).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Move to" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Move to" }).hover();
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Inbox", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Inbox", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  const header = page.locator("[data-section-header-menu]");
  await header.focus();
  await page.keyboard.press("Shift+F10");
  await expect(
    page.locator('[data-slot="context-menu-content"][data-open]'),
  ).toBeVisible();
  await page
    .locator('[data-slot="context-menu-content"][data-open]')
    .getByRole("menuitem", { name: "Delete" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Delete Alpha section?" }),
  ).toBeVisible();
  await expect(page.getByText("Delete the section and tasks")).toBeVisible();
  await expect(page.getByLabel("Destination section")).toBeVisible();
});
