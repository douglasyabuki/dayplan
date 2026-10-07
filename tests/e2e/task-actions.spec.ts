import { expect, type Page, test } from "@playwright/test";

const key = "dayplan.workspace.v2";
const baseTask = (id: string, order: number) => ({
  id,
  title: id === "a" ? "Alpha task" : "Beta task",
  parentId: null,
  description: "",
  projectId: null,
  sectionId: null,
  tagIds: ["work"],
  priority: "high",
  completed: false,
  archived: false,
  order,
  createdAt: "2026-10-01",
  schedule: { date: "2026-10-07", time: "10:00", duration: 30 },
  deadline: { date: "2026-10-08" },
});
async function seed(
  page: Page,
  board = false,
  tasks: object[] = [baseTask("a", 0), baseTask("b", 1)],
) {
  await page.addInitScript(
    ({ key, tasks, board }) => {
      if (!sessionStorage.getItem("test-seeded")) {
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 2,
            tasks,
            exceptions: {},
            sections: [],
            projects: [],
            tags: [{ id: "work", name: "Work", color: "sky" }],
            layouts: { inbox: board ? "board" : "list" },
            timezone: "UTC",
            theme: "light",
          }),
        );
        sessionStorage.setItem("test-seeded", "true");
      }
    },
    { key, tasks, board },
  );
  await page.goto("/inbox");
  await expect(
    page.getByRole("button", { name: "Edit Alpha task", exact: true }).first(),
  ).toBeVisible();
}
const card = (page: Page, title = "Alpha task") =>
  page
    .locator("[data-task-item]")
    .filter({
      has: page.getByRole("button", { name: `Edit ${title}`, exact: true }),
    })
    .first();
const popup = (page: Page) =>
  page.locator('[data-slot="popover-content"][data-open]');
const menu = (page: Page) =>
  page.locator('[data-slot="context-menu-content"][data-open]');
async function stored(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
}
async function drag(
  page: Page,
  locator: ReturnType<typeof card>,
  x = 100,
  y = 70,
) {
  const box = (await locator.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(box.x + box.width / 2 + x, box.y + box.height / 2 + y, {
    steps: 12,
  });
}

for (const board of [false, true]) {
  test(`${board ? "board" : "list"}: metadata updates, toggles and switches across cards`, async ({
    page,
  }) => {
    await seed(page, board);
    const alpha = card(page),
      beta = card(page, "Beta task");
    const flag = alpha.getByRole("button", { name: "Priority: high" });
    await flag.click();
    await expect(popup(page)).toHaveCount(1);
    await expect(page).not.toHaveURL(/task=/);
    await flag.click();
    await expect(popup(page)).toHaveCount(0);
    await flag.click();
    await popup(page).getByRole("button", { name: "Low", exact: true }).click();
    await expect(
      alpha.getByRole("button", { name: "Priority: low" }),
    ).toBeVisible();
    await expect(popup(page)).toHaveCount(0);
    await alpha.getByRole("button", { name: "Deadline", exact: true }).click();
    await expect(
      popup(page).getByText("Deadline", { exact: true }),
    ).toBeVisible();
    // The calendar covers the next row's date. Its priority trigger remains exposed.
    if (!board) {
      await beta.getByRole("button", { name: "Priority: high" }).click();
      await expect(popup(page)).toHaveCount(1);
    }
    await beta
      .getByRole("button", { name: "Scheduled work", exact: true })
      .click();
    await expect(popup(page)).toHaveCount(1);
    await expect(
      popup(page).getByText("Scheduled work", { exact: true }),
    ).toBeVisible();
    await popup(page).getByLabel("Start time (optional)").fill("14:30");
    await expect
      .poll(
        async () =>
          (await stored(page)).tasks.find((t: { id: string }) => t.id === "b")
            .schedule.time,
      )
      .toBe("14:30");
    await page.keyboard.press("Escape");
    await expect(popup(page)).toHaveCount(0);
    await alpha.getByRole("button", { name: "Deadline", exact: true }).click();
    await page.getByRole("heading", { name: "Inbox", exact: true }).click();
    await expect(popup(page)).toHaveCount(0);
  });
}

test("tag links retain normal, Ctrl-click and middle-click navigation", async ({
  page,
  context,
}) => {
  await seed(page);
  const link = card(page).getByRole("link", { name: "Work" });
  await expect(link).toHaveAttribute("href", "/tags/work");
  for (const input of [
    { modifiers: ["Control"] as ["Control"] },
    { button: "middle" as const },
  ]) {
    const nextPage = context.waitForEvent("page");
    await link.click(input);
    const tab = await nextPage;
    await tab.waitForURL("**/tags/work");
    await tab.close();
    await expect(page).not.toHaveURL(/task=/);
  }
  await link.click();
  await expect(page).toHaveURL(/\/tags\/work$/);
});

test("metadata and portaled controls cannot drag, title and ordinary space still can", async ({
  page,
}) => {
  await seed(page);
  const alpha = card(page);
  await drag(page, alpha.getByRole("button", { name: "Priority: high" }));
  await expect(page.locator("[data-task-item].opacity-30")).toHaveCount(0);
  await page.mouse.up();
  await alpha.getByRole("button", { name: "Scheduled work" }).click();
  await drag(page, popup(page).getByLabel("Start time (optional)"));
  await expect(page.locator("[data-task-item].opacity-30")).toHaveCount(0);
  await page.mouse.up();
  await popup(page).getByLabel("Start time (optional)").focus();
  await page.keyboard.press("Space");
  await expect(page).not.toHaveURL(/task=/);
  await page.keyboard.press("Escape");
  await alpha.getByRole("button", { name: "Deadline", exact: true }).click();
  await drag(
    page,
    alpha.getByRole("button", { name: "Edit Alpha task", exact: true }),
  );
  await expect(page.locator("[data-task-item].opacity-30")).not.toHaveCount(0);
  await expect(popup(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  const box = (await alpha.boundingBox())!;
  await page.mouse.move(box.x + box.width - 8, box.y + box.height - 8);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(box.x + box.width - 50, box.y + box.height + 60, {
    steps: 10,
  });
  await expect(page.locator("[data-task-item].opacity-30")).not.toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
});

test("context menu supports keyboard navigation, picker handoff, tags, duplicate and Undo", async ({
  page,
}) => {
  await seed(page);
  const alpha = card(page);
  await alpha.focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(menu(page).locator(":focus")).toHaveCount(1);
  await menu(page)
    .getByRole("menuitem", { name: "Priority", exact: true })
    .click();
  await expect(menu(page)).toHaveCount(0);
  await popup(page).getByRole("button", { name: "No priority" }).click();
  await expect(alpha.getByRole("button", { name: /^Priority:/ })).toHaveCount(
    0,
  );
  await alpha.click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Tags", exact: true }).click();
  await popup(page).getByRole("button", { name: "Work", exact: true }).click();
  await expect(alpha.getByRole("link", { name: "Work" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await alpha.click({ button: "right" });
  await menu(page)
    .getByRole("menuitem", { name: "Duplicate", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit Alpha task", exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Alpha task", exact: true }),
  ).toHaveCount(1);
});

test("date clearing and editor opening close quick actions", async ({
  page,
}) => {
  await seed(page);
  const alpha = card(page);
  await alpha.getByRole("button", { name: "Deadline", exact: true }).click();
  await popup(page).getByRole("button", { name: "Clear deadline" }).click();
  await expect(
    alpha.getByRole("button", { name: "Deadline", exact: true }),
  ).toHaveCount(0);
  await popup(page).getByRole("button", { name: "Done" }).click();
  await alpha.getByRole("button", { name: "Scheduled work" }).click();
  await alpha
    .getByRole("button", { name: "Edit Alpha task", exact: true })
    .click();
  await expect(page).toHaveURL(/task=/);
  await expect(page.locator("[data-task-title-input]")).toBeVisible();
  await expect(
    popup(page).getByText("Scheduled work", { exact: true }),
  ).toHaveCount(0);
});

test("recurrence scope is explicit and the shared editor keeps changes staged", async ({
  page,
}) => {
  await seed(page, false, [
    { ...baseTask("a", 0), recurrence: { frequency: "daily", weekdays: [] } },
    baseTask("b", 1),
  ]);
  const alpha = card(page);
  await alpha.getByRole("button", { name: "Priority: high" }).click();
  await expect(
    popup(page).getByRole("combobox", { name: "Apply changes to" }),
  ).toBeVisible();
  await popup(page).getByRole("button", { name: "Low", exact: true }).click();
  let state = await stored(page);
  expect(state.tasks.find((t: { id: string }) => t.id === "a").priority).toBe(
    "high",
  );
  expect(
    Object.values(state.exceptions).some(
      (e) =>
        (e as { overrides: { priority: string } }).overrides.priority === "low",
    ),
  ).toBeTruthy();
  await alpha.getByRole("button", { name: "Priority: low" }).click();
  await popup(page).getByRole("combobox", { name: "Apply changes to" }).click();
  await page.getByRole("option", { name: "Entire series" }).click();
  await popup(page)
    .getByRole("button", { name: "Medium", exact: true })
    .click();
  state = await stored(page);
  expect(state.tasks.find((t: { id: string }) => t.id === "a").priority).toBe(
    "medium",
  );
  // The explicitly overridden occurrence remains low after a template edit.
  await expect(
    alpha.getByRole("button", { name: "Priority: low" }),
  ).toBeVisible();
  await alpha
    .getByRole("button", { name: "Edit Alpha task", exact: true })
    .click();
  await page.getByRole("button", { name: "Priority: low" }).last().click();
  await popup(page).getByRole("button", { name: "High", exact: true }).click();
  state = await stored(page);
  expect(state.tasks.find((t: { id: string }) => t.id === "a").priority).toBe(
    "medium",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    alpha.getByRole("button", { name: "Priority: high" }),
  ).toBeVisible();
});

test("archive preserves independently archived children and scoped delete supports Undo", async ({
  page,
}) => {
  await seed(page, false, [
    baseTask("a", 0),
    baseTask("b", 1),
    { ...baseTask("c", 0), title: "Child task", parentId: "a", archived: true },
  ]);
  await card(page).click({ button: "right" });
  await menu(page)
    .getByRole("menuitem", { name: "Archive", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit Alpha task", exact: true }),
  ).toHaveCount(0);
  let state = await stored(page);
  expect(state.tasks.find((t: { id: string }) => t.id === "c").archived).toBe(
    true,
  );
  await page.locator('a[href="/archive"]').click();
  await card(page).click({ button: "right" });
  await menu(page)
    .getByRole("menuitem", { name: "Restore", exact: true })
    .click();
  state = await stored(page);
  expect(state.tasks.find((t: { id: string }) => t.id === "a").archived).toBe(
    false,
  );
  expect(state.tasks.find((t: { id: string }) => t.id === "c").archived).toBe(
    true,
  );
  await page.locator('a[href="/inbox"]').click();
  await card(page).click({ button: "right" });
  await menu(page)
    .getByRole("menuitem", { name: "Delete...", exact: true })
    .click();
  await popup(page)
    .getByRole("button", { name: /Delete task/ })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Delete this task and its subtasks?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Alpha task", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Alpha task", exact: true }),
  ).toBeVisible();
});

test("nested metadata, route dismissal, focus return and viewport bounds", async ({
  page,
}) => {
  await page.setViewportSize({ width: 740, height: 650 });
  await seed(page, false, [
    baseTask("a", 0),
    baseTask("b", 1),
    { ...baseTask("c", 0), title: "Child task", parentId: "a" },
  ]);
  await card(page)
    .getByRole("button", { name: /subtasks$/ })
    .click();
  const child = page.locator('[data-depth="1"]').first();
  await child.getByRole("button", { name: "Priority: high" }).click();
  await expect(popup(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(
    child.getByRole("button", { name: "Priority: high" }),
  ).toBeFocused();
  await child.getByRole("button", { name: "Scheduled work" }).click();
  await expect
    .poll(async () => {
      const box = (await popup(page).boundingBox())!;
      return (
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= 741 &&
        box.y + box.height <= 651
      );
    })
    .toBe(true);
  await page.keyboard.press("Escape");
  await child.getByRole("button", { name: "Priority: high" }).click();
  await child.getByRole("link", { name: "Work" }).click();
  await expect(page).toHaveURL(/\/tags\/work$/);
  await expect(popup(page)).toHaveCount(0);
});

test("Add subtask focuses its editor field and metadata right-click opens the task menu", async ({
  page,
}) => {
  await seed(page);
  await card(page)
    .getByRole("button", { name: "Priority: high" })
    .click({ button: "right" });
  await expect(menu(page)).toBeVisible();
  await menu(page)
    .getByRole("menuitem", { name: "Add subtask", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "New subtask" }),
  ).toBeFocused();
});
