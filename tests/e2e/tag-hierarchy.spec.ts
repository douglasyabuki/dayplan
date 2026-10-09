import { expect, type Page, test } from "@playwright/test";

const key = "dayplan.workspace.v2";
async function seed(page: Page, legacy = false) {
  await page.addInitScript(
    ({ key, legacy }) => {
      if (sessionStorage.getItem("tags-seeded")) return;
      const tag = (
        id: string,
        name: string,
        parentId: string | null,
        order: number,
      ) =>
        legacy
          ? { id, name, color: "sky" }
          : { id, name, color: "sky", parentId, order };
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 2,
          timezone: "UTC",
          theme: "light",
          layouts: {},
          projects: [],
          sections: [],
          exceptions: {},
          tags: [
            tag("work", "Work", null, 0),
            tag("meetings", "Meetings", "work", 0),
            tag("weekly", "Weekly", "meetings", 0),
            tag("personal", "Personal", null, 1),
          ],
          tasks: [
            { id: "a", title: "Related task", tagIds: ["work", "weekly"] },
            { id: "b", title: "Child task", tagIds: ["meetings"] },
            { id: "c", title: "Other task", tagIds: ["personal"] },
          ].map((task, order) => ({
            ...task,
            order,
            parentId: null,
            projectId: null,
            sectionId: null,
            description: "",
            priority: "none",
            completed: false,
            archived: false,
            createdAt: "2026-10-01",
          })),
        }),
      );
      sessionStorage.setItem("tags-seeded", "true");
    },
    { key, legacy },
  );
  await page.goto("/tags");
  await expect(
    page.getByRole("list", { name: "Manage tags", exact: true }),
  ).toBeVisible();
}
const tree = (page: Page) =>
  page.getByRole("list", { name: "Manage tags", exact: true });
const sidebar = (page: Page) =>
  page.getByRole("list", { name: "Sidebar tags", exact: true });
const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
async function action(page: Page, name: string, action: string) {
  await tree(page)
    .getByRole("button", { name: `Actions for ${name}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}

test("collapse persists and filtering and counts include descendants", async ({
  page,
}) => {
  await seed(page);
  await expect(tree(page).locator('[data-tag-row="work"]')).toContainText("2");
  await tree(page)
    .getByRole("button", { name: "Collapse Work", exact: true })
    .click();
  await expect(
    sidebar(page).getByRole("link", { name: "Work / Meetings", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    tree(page).getByRole("button", { name: "Expand Work", exact: true }),
  ).toBeVisible();
  await tree(page).getByRole("link", { name: "Work", exact: true }).click();
  await expect(page.locator("[data-task-item]")).toHaveCount(2);
  await expect(
    page.getByText("Includes subtags", { exact: false }),
  ).toBeVisible();
  await page.goto("/tags/weekly");
  await expect(
    sidebar(page).getByRole("link", {
      name: "Work / Meetings / Weekly",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("[data-task-item]")).toHaveCount(1);
});

test("create, move with keyboard, rename, delete and undo a complete subtree", async ({
  page,
}) => {
  await seed(page);
  await action(page, "Meetings", "Create subtag");
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Notes");
  await dialog.getByRole("button", { name: "Save tag", exact: true }).click();
  await expect(
    tree(page).getByRole("link", {
      name: "Work / Meetings / Notes",
      exact: true,
    }),
  ).toBeVisible();
  await action(page, "Meetings", "Move to");
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Work / Meetings", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", {
      name: "Work / Meetings / Weekly",
      exact: true,
    }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Personal", exact: true }).focus();
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: "Move tag", exact: true }).click();
  await expect(
    tree(page).getByRole("link", {
      name: "Personal / Meetings / Weekly",
      exact: true,
    }),
  ).toBeVisible();
  await action(page, "Personal", "Open/Edit");
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Home");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save tag", exact: true })
    .click();
  await expect(
    tree(page).getByRole("link", {
      name: "Home / Meetings / Weekly",
      exact: true,
    }),
  ).toBeVisible();
  const before = await stored(page);
  await action(page, "Meetings", "Delete");
  await expect(page.getByRole("dialog")).toContainText(
    "subtags will move to its parent",
  );
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    tree(page).getByRole("link", { name: "Home / Weekly", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await stored(page)).tasks[1].tagIds)
    .toEqual([]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => stored(page)).toEqual(before);
  await page.reload();
  await expect(
    tree(page).getByRole("link", {
      name: "Home / Meetings / Weekly",
      exact: true,
    }),
  ).toBeVisible();
});

test("drag from a sidebar label to nest and cancel, then promote and reorder with menus", async ({
  page,
}) => {
  await seed(page);
  const source = sidebar(page).getByRole("link", {
    name: "Personal",
    exact: true,
  });
  const target = sidebar(page).locator('[data-tag-row="meetings"]');
  const start = (await source.boundingBox())!,
    end = (await target.boundingBox())!;
  await page.mouse.move(start.x + 35, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 45, start.y + start.height / 2, { steps: 5 });
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 15,
  });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await stored(page)).tags.find(
          (t: { id: string }) => t.id === "personal",
        ).parentId,
    )
    .toBe("meetings");
  await expect(page).toHaveURL(/\/tags$/);
  const row = sidebar(page).locator('[data-tag-row="personal"]');
  await expect(row).toHaveAttribute("data-tag-busy", "false");
  const next = (await row.getByRole("link").boundingBox())!;
  await page.mouse.move(next.x + 40, next.y + next.height / 2);
  await page.mouse.down();
  await page.mouse.move(next.x + 55, next.y + next.height / 2, { steps: 5 });
  await expect(page.locator("[data-tag-root-target]").first()).toContainText(
    "Move to top level",
  );
  const root = (await page
    .locator("[data-tag-root-target]")
    .first()
    .boundingBox())!;
  await page.mouse.move(root.x + root.width / 2, root.y + root.height / 2, {
    steps: 15,
  });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(
    (await stored(page)).tags.find((t: { id: string }) => t.id === "personal")
      .parentId,
  ).toBe("meetings");
  await action(page, "Personal", "Move to");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Top level", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Move tag", exact: true })
    .click();
  await expect(
    tree(page).getByRole("link", { name: "Personal", exact: true }),
  ).toBeVisible();
  await action(page, "Personal", "Move up");
  await expect
    .poll(
      async () =>
        (await stored(page)).tags.find(
          (t: { id: string }) => t.id === "personal",
        ).order,
    )
    .toBe(0);
});

test("vertical tag dragging keeps its destination despite sideways pointer drift", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await seed(page, true);
  const source = (await sidebar(page)
    .locator('[data-tag-row="work"]')
    .boundingBox())!;
  const target = (await sidebar(page)
    .locator('[data-tag-row="meetings"]')
    .boundingBox())!;
  const x = target.x + target.width / 2;
  await page.mouse.move(x, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(x + 10, source.y + source.height / 2, { steps: 5 });
  for (const offset of [4, 5, 6, 12, 18, 28, 30, 31]) {
    await page.mouse.move(x, target.y + offset);
    const intent = offset < 9 ? "before" : offset > 27 ? "after" : "inside";
    await expect(
      sidebar(page).locator('[data-tag-row="meetings"]'),
    ).toHaveAttribute("data-tag-drop-intent", intent);
    await expect(sidebar(page).locator("[data-tag-drop-preview]")).toHaveCount(
      1,
    );
    const preview = (await sidebar(page)
      .locator("[data-tag-drop-preview]")
      .boundingBox())!;
    // Moving the pointer outside the sidebar must not clear the destination.
    await page.mouse.move(x + 300, target.y + offset);
    await expect(
      sidebar(page).locator('[data-tag-row="meetings"]'),
    ).toHaveAttribute("data-tag-drop-intent", intent);
    expect(
      (await sidebar(page).locator("[data-tag-drop-preview]").boundingBox())!.y,
    ).toBe(preview.y);
  }
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await stored(page)).tags.find(
          (tag: { id: string }) => tag.id === "work",
        ).order,
    )
    .toBe(1);
  expect(
    (await stored(page)).tags.every(
      (tag: { parentId: string | null }) => tag.parentId === null,
    ),
  ).toBe(true);
});

test("task picker searches paths and preserves hidden direct assignments", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/tasks");
  const card = page
    .locator("[data-task-item]")
    .filter({
      has: page.getByRole("button", { name: "Edit Other task", exact: true }),
    })
    .first();
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Tags", exact: true }).click();
  const popup = page.locator('[data-slot="popover-content"][data-open]');
  await popup.getByRole("textbox", { name: "Search tags" }).fill("Weekly");
  await popup
    .getByRole("button", { name: "Work / Meetings / Weekly", exact: true })
    .click();
  await expect
    .poll(async () => (await stored(page)).tasks[2].tagIds)
    .toEqual(["personal", "weekly"]);
  await popup.getByRole("textbox", { name: "Search tags" }).fill("Personal");
  await popup.getByRole("button", { name: "Personal", exact: true }).click();
  await expect
    .poll(async () => (await stored(page)).tasks[2].tagIds)
    .toEqual(["weekly"]);
});

test("legacy browser data remains intact through migration", async ({
  page,
}) => {
  await seed(page, true);
  await expect
    .poll(async () =>
      (await stored(page)).tags.map(
        (t: { parentId: string | null }) => t.parentId,
      ),
    )
    .toEqual([null, null, null, null]);
  expect((await stored(page)).tasks[0].tagIds).toEqual(["work", "weekly"]);
  await page.reload();
  await expect(
    tree(page).getByRole("link", { name: "Weekly", exact: true }),
  ).toBeVisible();
});

test("dragging row edges reorders and the root target promotes a subtree", async ({
  page,
}) => {
  await seed(page);
  async function drag(id: string, destination: string, fraction: number) {
    const source = sidebar(page).locator(`[data-tag-row="${id}"]`);
    await expect(source).toHaveAttribute("data-tag-busy", "false");
    const start = (await source.getByRole("link").boundingBox())!;
    await page.mouse.move(start.x + 10, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + 20, start.y + start.height / 2, {
      steps: 5,
    });
    const target =
      destination === "root"
        ? page.locator("[data-tag-root-target]").first()
        : sidebar(page).locator(`[data-tag-row="${destination}"]`);
    await expect(page.locator("[data-tag-root-target]").first()).toHaveText(
      "Move to top level",
    );
    const end = (await target.boundingBox())!;
    await page.mouse.move(
      end.x + end.width / 2,
      end.y + end.height * fraction,
      { steps: 15 },
    );
    await page.mouse.up();
  }
  await drag("personal", "work", 0.1);
  await expect
    .poll(
      async () =>
        (await stored(page)).tags.find(
          (t: { id: string }) => t.id === "personal",
        ).order,
    )
    .toBe(0);
  await drag("meetings", "root", 0.5);
  await expect
    .poll(
      async () =>
        (await stored(page)).tags.find(
          (t: { id: string }) => t.id === "meetings",
        ).parentId,
    )
    .toBeNull();
  await expect(
    sidebar(page).getByRole("link", { name: "Meetings / Weekly", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    sidebar(page).getByRole("link", { name: "Meetings / Weekly", exact: true }),
  ).toBeVisible();
});

test("deep trees stay within the sidebar and context-menu deletion navigates away", async ({
  page,
}) => {
  await seed(page);
  await page.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key)!);
    data.tags = Array.from({ length: 24 }, (_, i) => ({
      id: `deep-${i}`,
      name: `Level ${i} with a long tag name`,
      color: "sky",
      parentId: i ? `deep-${i - 1}` : null,
      order: 0,
    }));
    data.tasks = [];
    localStorage.setItem(key, JSON.stringify(data));
  }, key);
  await page.reload();
  const content = page.locator('[data-slot="sidebar-content"]');
  expect(await content.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.goto("/tags/deep-23");
  const deepest = sidebar(page).locator('[data-tag-row="deep-23"]');
  await deepest.scrollIntoViewIfNeeded();
  await deepest.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page).toHaveURL(/\/tags$/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .locator("body")
      .evaluate((el) => el.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("dropping a parent over its descendant leaves the workspace unchanged", async ({
  page,
}) => {
  // Keep the descendant in view without edge auto-scrolling during the gesture.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await seed(page);
  const before = await stored(page);
  const source = (await sidebar(page)
    .locator('[data-tag-row="work"]')
    .getByRole("link")
    .boundingBox())!;
  const descendant = (await sidebar(page)
    .locator('[data-tag-row="weekly"]')
    .boundingBox())!;
  await page.mouse.move(source.x + 15, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 25, source.y + source.height / 2, {
    steps: 5,
  });
  await page.mouse.move(
    descendant.x + descendant.width / 2,
    descendant.y + descendant.height / 2,
    { steps: 15 },
  );
  await page.mouse.up();
  await expect(
    sidebar(page).locator('[data-tag-row="work"]:not([data-dnd-placeholder])'),
  ).toHaveAttribute("data-tag-busy", "false");
  expect(await stored(page)).toEqual(before);
});
