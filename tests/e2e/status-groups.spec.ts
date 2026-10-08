import { expect, type Locator, type Page, test } from "@playwright/test";

const key = "dayplan.workspace.v2";
const card = (page: Page, id: string) =>
  page.locator(`[data-task-ref='${JSON.stringify([id])}']`).first();
const group = (page: Page, parent: string | null, completed: boolean) =>
  page
    .locator(
      `[data-status-parent='${parent ? JSON.stringify([parent]) : "root"}'][data-status-group='${completed ? "completed" : "open"}']`,
    )
    .first();
async function stored(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
}
async function seed(page: Page, board: boolean) {
  await page.setViewportSize({ width: 1400, height: 1100 });
  await page.addInitScript(
    ({ key, board }) => {
      if (sessionStorage.getItem("status-seeded")) return;
      sessionStorage.setItem("status-seeded", "true");
      const tasks = [
        ["parent", null, false],
        ["open", "parent", false],
        ["done", "parent", true],
        ["grandchild", "open", false],
        ["grand-done", "open", true],
        ["great", "grandchild", false],
        ["other", null, false],
      ].map(([id, parentId, completed], order) => ({
        id,
        parentId,
        completed,
        title: id,
        projectId: null,
        sectionId: null,
        description: "",
        tagIds: [],
        priority: "none",
        archived: false,
        order,
        createdAt: "2026-10-01",
      }));
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 2,
          tasks,
          projects: [],
          sections: [{ id: "alpha", projectId: null, name: "Alpha", order: 0 }],
          tags: [],
          exceptions: {},
          layouts: { inbox: board ? "board" : "list" },
          timezone: "UTC",
          theme: "light",
        }),
      );
    },
    { key, board },
  );
  await page.goto("http://localhost:3000/inbox?status=all");
  await expect(card(page, "parent")).toBeVisible();
}
async function expand(page: Page, id: string) {
  const trigger = card(page, id)
    .getByRole("button", { name: /subtasks/ })
    .first();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}
async function startDrag(page: Page, id: string) {
  const source = card(page, id).getByRole("button", {
    name: `Edit ${id}`,
    exact: true,
  });
  await source.scrollIntoViewIfNeeded();
  const box = (await source.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(
    box.x + box.width / 2 + 12,
    box.y + box.height / 2 + 12,
    { steps: 5 },
  );
}
async function over(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  await page.mouse.move(
    box.x + Math.min(120, box.width / 2),
    box.y + box.height / 2,
    {
      steps: 20,
    },
  );
  // Incoming previews can shift later siblings while crossing earlier groups.
  const settled = (await target.boundingBox())!;
  await page.mouse.move(
    settled.x + Math.min(120, settled.width / 2),
    settled.y + settled.height / 2,
  );
}

for (const board of [false, true]) {
  const layout = board ? "board" : "list";
  test(`${layout}: named section drops and collapse preferences survive layout changes`, async ({
    page,
  }) => {
    await seed(page, board);
    const section = page.getByRole("region", { name: "Alpha", exact: true });
    await startDrag(page, "other");
    await section.scrollIntoViewIfNeeded();
    await over(
      page,
      section.getByRole("button", { name: "Completed 0", exact: true }),
    );
    await page.mouse.up();
    await expect
      .poll(async () =>
        (await stored(page)).tasks.find(
          (t: { id: string }) => t.id === "other",
        ),
      )
      .toMatchObject({ parentId: null, sectionId: "alpha", completed: true });
    await section
      .getByRole("button", { name: "Completed 1", exact: true })
      .click();
    await page
      .getByRole("button", { name: board ? "List" : "Kanban", exact: true })
      .click();
    await expect(
      section.getByRole("button", { name: "Completed 1", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
  test(`${layout}: empty nested groups reopen and cross-parent drops retain hierarchy`, async ({
    page,
  }) => {
    await seed(page, board);
    await expand(page, "parent");
    await expand(page, "open");
    await expand(page, "grandchild");
    await startDrag(page, "done");
    await over(
      page,
      group(page, "grandchild", true).getByRole("button", {
        name: "Completed 0",
        exact: true,
      }),
    );
    await page.mouse.up();
    await expect
      .poll(async () =>
        (await stored(page)).tasks.find((t: { id: string }) => t.id === "done"),
      )
      .toMatchObject({ parentId: "grandchild", completed: true });
    await card(page, "great")
      .getByRole("checkbox", { name: "Complete great", exact: true })
      .click();
    await startDrag(page, "done");
    await over(
      page,
      group(page, "grandchild", false).getByText("Drop here to mark open", {
        exact: true,
      }),
    );
    await page.mouse.up();
    await expect
      .poll(async () =>
        (await stored(page)).tasks.find((t: { id: string }) => t.id === "done"),
      )
      .toMatchObject({ parentId: "grandchild", completed: false });
    await startDrag(page, "done");
    await over(
      page,
      card(page, "other").getByRole("button", {
        name: "Edit other",
        exact: true,
      }),
    );
    await over(
      page,
      card(page, "other").getByRole("button", {
        name: "Edit other",
        exact: true,
      }),
    );
    await expect(
      page.getByText("Make subtask of other", { exact: true }),
    ).toBeVisible();
    await page.mouse.up();
    await expect
      .poll(async () =>
        (await stored(page)).tasks.find((t: { id: string }) => t.id === "done"),
      )
      .toMatchObject({ parentId: "other", completed: false });
  });

  test(`${layout}: keyboard drop into a sibling status group`, async ({
    page,
  }) => {
    await seed(page, board);
    await expand(page, "parent");
    await card(page, "open").focus();
    await page.keyboard.press("Space");
    for (let step = 0; step < 8; step++) {
      await page.keyboard.press("ArrowDown");
      const destination = await page
        .locator("[data-task-drop-preview]")
        .first()
        .getAttribute("data-task-drop-preview")
        .catch(() => null);
      if (destination && JSON.parse(destination).completed === true) break;
    }
    await expect(
      page.locator("[data-task-drop-preview]").first(),
    ).toHaveAttribute("data-task-drop-preview", /"completed":true/);
    await page.keyboard.press("Space");
    await expect
      .poll(async () =>
        (await stored(page)).tasks.find((t: { id: string }) => t.id === "open"),
      )
      .toMatchObject({ parentId: "parent", completed: true });
  });

  test(`${layout}: recursive groups count direct children and filtered views hide headings`, async ({
    page,
  }) => {
    await seed(page, board);
    await expand(page, "parent");
    await expand(page, "open");
    await expand(page, "grandchild");
    await expect(card(page, "great")).toBeVisible();
    await expect(
      group(page, "parent", true).getByRole("button", {
        name: "Completed 1",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      group(page, "open", true).getByRole("button", {
        name: "Completed 1",
        exact: true,
      }),
    ).toBeVisible();
    const trigger = group(page, "parent", true).getByRole("button", {
      name: "Completed 1",
      exact: true,
    });
    await trigger.click();
    await expect(card(page, "done")).not.toBeVisible();
    await page.evaluate(() =>
      window.history.pushState(null, "", "/inbox?status=completed"),
    );
    await expect(page.locator("[data-status-group]")).toHaveCount(0);
    await expect(card(page, "done")).toBeVisible();
    await page.evaluate(() =>
      window.history.pushState(null, "", "/inbox?status=open"),
    );
    await expect(page.locator("[data-status-group]")).toHaveCount(0);
    await expect(card(page, "done")).not.toBeVisible();
    await page.evaluate(() =>
      window.history.pushState(null, "", "/inbox?status=all"),
    );
    await expect(
      group(page, "parent", true).getByRole("button", {
        name: "Completed 1",
        exact: true,
      }),
    ).toHaveAttribute("aria-expanded", "false");
    await card(page, "open")
      .getByRole("checkbox", { name: "Complete open", exact: true })
      .click();
    const next = await stored(page);
    expect(
      next.tasks.find((t: { id: string }) => t.id === "open"),
    ).toMatchObject({ parentId: "parent", completed: true });
    await expect(
      group(page, "parent", true).getByRole("button", {
        name: "Completed 2",
        exact: true,
      }),
    ).toBeVisible();
  });

  test(`${layout}: collapsed nested status drop expands, preserves parent and supports Undo`, async ({
    page,
  }) => {
    await seed(page, board);
    await expand(page, "parent");
    const trigger = group(page, "parent", true).getByRole("button", {
      name: "Completed 1",
      exact: true,
    });
    await trigger.click();
    await startDrag(page, "open");
    await over(page, trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-task-drop-preview]")).toHaveCount(1);
    await page.mouse.up();
    await expect
      .poll(async () =>
        (await stored(page)).tasks.find((t: { id: string }) => t.id === "open"),
      )
      .toMatchObject({ parentId: "parent", completed: true });
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await stored(page)).tasks.find(
            (t: { id: string }) => t.id === "open",
          ).completed,
      )
      .toBe(false);
    await startDrag(page, "open");
    await over(page, trigger);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(
      (await stored(page)).tasks.find((t: { id: string }) => t.id === "open"),
    ).toMatchObject({ parentId: "parent", completed: false });
  });
}
