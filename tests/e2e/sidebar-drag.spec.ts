import { expect, type Page, test } from "@playwright/test";

async function seed(page: Page, board = false, projectCount = 1, tagCount = 0) {
  await page.addInitScript(
    ({ board, projectCount, tagCount }) =>
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
          tags: Array.from({ length: tagCount }, (_, i) => ({
            id: `tag-${i}`,
            name: `Tag ${i}`,
            color: "sky",
            parentId: i === 1 || i === 2 ? "tag-0" : null,
            order: i,
          })),
          sections: [],
          exceptions: {},
          layouts: { inbox: board ? "board" : "list" },
          timezone: "UTC",
          theme: "light",
        }),
      ),
    { board, projectCount, tagCount },
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
  const content = page.getByRole("region", { name: "Projects list" });
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

for (const [width, height, projects, tags] of [
  [1440, 900, 30, 30],
  [1440, 900, 3, 30],
  [1440, 900, 4, 30],
  [1440, 900, 30, 4],
  [1280, 600, 30, 30],
  [1024, 480, 30, 30],
  [844, 390, 30, 30],
  [390, 844, 30, 30],
  [320, 568, 30, 30],
  [1280, 600, 2, 30],
  [1280, 600, 30, 2],
  [1280, 600, 0, 0],
]) {
  test(`whole sidebar rows at ${width}x${height}, ${projects} projects / ${tags} tags`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    await seed(page, false, projects, tags);
    if (width < 768)
      await page.getByRole("button", { name: "Expand sidebar" }).click();

    const sidebar = page.locator('[data-slot="sidebar-content"]');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /Add task/ })).toHaveCount(
      0,
    );
    for (const [name, count] of [
      ["Projects list", projects],
      ["Tags list", tags],
    ] as const) {
      const list = page.getByRole("region", { name });
      await expect(list).toBeVisible();
      if (!count) continue;
      await expect
        .poll(() => list.evaluate((el) => el.clientHeight))
        .toBeGreaterThanOrEqual(36);
      const assertWholeRows = async () => {
        await expect
          .poll(() =>
            list.evaluate((el) => {
              const viewport = el.getBoundingClientRect();
              return [...el.querySelectorAll("a")].every((link) => {
                const row = link.getBoundingClientRect();
                return (
                  row.bottom <= viewport.top + 1 ||
                  row.top >= viewport.bottom - 1 ||
                  (row.top >= viewport.top - 1 &&
                    row.bottom <= viewport.bottom + 1)
                );
              });
            }),
          )
          .toBe(true);
      };
      await assertWholeRows();
      if (height >= 900) {
        await expect
          .poll(() => list.evaluate((el) => el.clientHeight))
          .toBeGreaterThanOrEqual(Math.min(count, 4) * 36);
        if (count <= 4)
          expect(
            await list.evaluate((el) => el.scrollHeight - el.clientHeight),
          ).toBe(0);
      }
      await list.hover();
      await page.mouse.wheel(0, 83);
      await assertWholeRows();
      await list.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await assertWholeRows();
      await expect(list.locator("a").last()).toBeInViewport();
      expect(await list.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(
        0,
      );
    }
    await expect(
      page.getByRole("link", { name: "Completed", exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole("link", { name: "Archive", exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("sidebar.png") });

    if (width >= 768 && projects > 4 && tags > 4) {
      const list = page.getByRole("region", { name: "Projects list" });
      const before = await list.evaluate((el) => el.clientHeight);
      await page.setViewportSize({ width, height: height + 300 });
      await expect
        .poll(() => list.evaluate((el) => el.clientHeight))
        .toBeGreaterThan(before);
    }
  });
}
