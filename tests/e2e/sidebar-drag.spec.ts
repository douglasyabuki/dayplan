import { expect, type Page, test } from "@playwright/test";

async function seed(page: Page, board = false, projectCount = 1) {
  await page.addInitScript(
    ({ board, projectCount }) =>
      localStorage.setItem(
        "dayplan.workspace.v2",
        JSON.stringify({
          version: 2,
          tasks: [
            {
              id: "drag-task",
              title: "Drag task",
              parentId: null,
              description: "",
              projectId: null,
              sectionId: null,
              tagIds: [],
              priority: "none",
              completed: false,
              archived: false,
              order: 0,
              createdAt: "2026-10-01",
            },
          ],
          projects: Array.from({ length: projectCount }, (_, i) => ({
            id: `project-${i}`,
            name: `Project ${i}`,
            color: "sky",
          })),
          tags: [],
          sections: [],
          exceptions: {},
          layouts: { inbox: board ? "board" : "list" },
          timezone: "UTC",
          theme: "light",
        }),
      ),
    { board, projectCount },
  );
  // Match the existing dev server's origin: Next blocks dev assets from other origins.
  await page.goto("http://localhost:3000/inbox");
  await expect(page.locator("[data-task-item]").first()).toBeVisible();
}

for (const board of [false, true]) {
  test(`${board ? "board" : "list"}: sidebar stays horizontally stationary while dragging at project edges`, async ({
    page,
  }) => {
    await seed(page, board);
    const task = page.locator("[data-task-item]").first();
    await expect(task).toBeVisible();
    const project = page
      .locator('[data-slot="sidebar-content"] a[href^="/projects/"]')
      .first();
    const target = (await project.boundingBox())!;
    const source = (await task.boundingBox())!;
    const content = page.locator('[data-slot="sidebar-content"]');
    await page.mouse.move(
      source.x + source.width / 2,
      source.y + source.height / 2,
    );
    await page.mouse.down();
    await page.waitForTimeout(250);
    // Reverse direction to unlock dnd-kit's scroll intent in both directions.
    for (const x of [
      target.x + target.width - 2,
      target.x + 2,
      target.x + target.width - 2,
    ]) {
      await page.mouse.move(x, target.y + target.height / 2, { steps: 20 });
      await page.waitForTimeout(1000);
      expect(
        await content.evaluate((el) => ({
          left: el.scrollLeft,
          overflow: el.scrollWidth - el.clientWidth,
        })),
      ).toEqual({ left: 0, overflow: 0 });
      expect((await project.boundingBox())!.x).toBe(target.x);
    }
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("dayplan.workspace.v2")!).tasks[0]
              .projectId,
        ),
      )
      .toBe("project-0");
  });
}

test("long project lists still auto-scroll vertically during a drag", async ({
  page,
}) => {
  await seed(page, false, 30);
  const content = page.locator('[data-slot="sidebar-content"]');
  const bounds = (await content.boundingBox())!;
  const source = (await page
    .locator("[data-task-item]")
    .first()
    .boundingBox())!;
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height - 4,
    { steps: 20 },
  );
  await expect
    .poll(() => content.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(await content.evaluate((el) => el.scrollLeft)).toBe(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
});
