import { expect, type Locator, type Page, test } from "@playwright/test";

const key = "dayplan.workspace.v2";
const card = (page: Page, id: string) =>
  page.locator(`[data-task-ref='${JSON.stringify([id])}']`).first();
const group = (page: Page, kind: string, value: string | null) =>
  page.locator(`[data-aggregate-group='${JSON.stringify([kind, value])}']`);
const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
const storedTask = async (page: Page, id: string) =>
  (await stored(page)).tasks.find((t: { id: string }) => t.id === id);

async function seed(
  page: Page,
  board: boolean,
  route: string,
  inboxOverdue = false,
) {
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00Z"));
  await page.addInitScript(() =>
    localStorage.setItem("dayplan.onboarding.v1", "complete"),
  );
  await page.addInitScript(
    ({ key, board, inboxOverdue }) => {
      if (sessionStorage.getItem("aggregate-seeded")) return;
      sessionStorage.setItem("aggregate-seeded", "true");
      const base = {
        parentId: null,
        description: "",
        projectId: "p",
        sectionId: "s",
        tagIds: [],
        priority: "low",
        completed: false,
        archived: false,
        createdAt: "2026-10-01",
      };
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 2,
          timezone: "UTC",
          theme: "light",
          exceptions: {},
          tags: [],
          projects: [
            { id: "p", name: "Project A", color: "sky" },
            { id: "q", name: "Project B", color: "sky" },
          ],
          sections: [{ id: "s", name: "Research", projectId: "p", order: 0 }],
          layouts: Object.fromEntries(
            ["today", "upcoming", "tasks"].map((v) => [
              `view:${v}`,
              board ? "board" : "list",
            ]),
          ),
          tasks: [
            {
              ...base,
              id: "a",
              title: "Alpha",
              order: 0,
              schedule: { date: "2026-10-10", time: "09:00", duration: 90 },
              deadline: { date: "2026-10-12", time: "17:00" },
            },
            {
              ...base,
              id: "b",
              title: "Beta",
              order: 1,
              priority: "high",
              projectId: "q",
              sectionId: null,
              schedule: { date: "2026-10-11", duration: 30 },
            },
            {
              ...base,
              id: "child",
              title: "Child",
              parentId: "a",
              projectId: null,
              sectionId: null,
              order: 2,
              priority: "high",
            },
            {
              ...base,
              id: "overdue",
              title: "Overdue task",
              order: 3,
              ...(inboxOverdue ? { projectId: null, sectionId: null } : {}),
              deadline: { date: "2026-10-09" },
            },
          ],
        }),
      );
    },
    { key, board, inboxOverdue },
  );
  await page.goto(route);
  await expect(
    page
      .locator("header")
      .getByRole("button", { name: "Add task", exact: true }),
  ).toBeVisible();
}

async function startDrag(page: Page, id = "a") {
  const title = card(page, id).locator(".task-title");
  await title.scrollIntoViewIfNeeded();
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 12,
    box.y + box.height / 2 + 12,
    { steps: 5 },
  );
  await expect(card(page, id)).toHaveClass(/opacity-30/);
}

async function over(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = (await locator.boundingBox())!;
  await page.mouse.move(
    box.x + Math.min(box.width / 2, 110),
    box.y + Math.min(box.height / 2, 20),
    { steps: 20 },
  );
  const settled = (await locator.boundingBox())!;
  await page.mouse.move(
    settled.x + Math.min(settled.width / 2, 110),
    settled.y + Math.min(settled.height / 2, 20),
  );
}

for (const board of [false, true]) {
  const layout = board ? "board" : "list";
  test(`${layout}: header and group creation use the editor and compatible defaults`, async ({
    page,
  }) => {
    await seed(page, board, "/today?group=priority");
    await expect(
      page.getByRole("textbox", { name: "Quick add task" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Page actions" }),
    ).toHaveCount(0);
    await group(page, "priority", "low")
      .getByRole("button", { name: "Add task to Low priority" })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Create task",
      exact: true,
    });
    await expect(
      editor.getByRole("button", { name: /Schedule: Today/ }),
    ).toBeVisible();
    await expect(
      editor.getByRole("button", { name: "Priority: low" }),
    ).toBeVisible();
    await editor
      .getByRole("textbox", { name: "Task title" })
      .fill("Created in group");
    await editor
      .getByRole("button", { name: "Create task", exact: true })
      .click();
    await expect
      .poll(async () =>
        (await stored(page)).tasks.find(
          (t: { title: string }) => t.title === "Created in group",
        ),
      )
      .toMatchObject({
        priority: "low",
        schedule: { date: "2026-10-10", duration: 30 },
        sectionId: null,
      });
    await page
      .locator("header")
      .getByRole("button", { name: "Add task", exact: true })
      .click();
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(editor).toHaveCount(0);
    expect((await stored(page)).tasks).toHaveLength(5);
  });

  test(`${layout}: Upcoming header dates and post-save feedback`, async ({
    page,
  }) => {
    await seed(page, board, "/upcoming");
    await page
      .locator("header")
      .getByRole("button", { name: "Add task", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Create task",
      exact: true,
    });
    await expect(
      editor.getByRole("button", { name: /Schedule: Today/ }),
    ).toBeVisible();
    await editor
      .getByRole("textbox", { name: "Task title" })
      .fill("Undated new task");
    await editor.getByRole("button", { name: /Schedule: Today/ }).click();
    await page
      .getByRole("button", { name: "Clear schedule", exact: true })
      .click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      editor.getByRole("button", { name: "Schedule: Not set" }),
    ).toBeVisible();
    await editor
      .getByRole("button", { name: "Create task", exact: true })
      .click();
    await expect(
      page.getByText("Task saved in Inbox; its dates fall outside this view."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open task", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Task title" })).toHaveValue(
      "Undated new task",
    );
  });

  test(`${layout}: priority drops preserve location, hierarchy, dates and support Undo`, async ({
    page,
  }) => {
    await seed(page, board, "/tasks?group=priority&sort=title");
    const before = await storedTask(page, "a");
    await startDrag(page);
    await over(page, card(page, "b").locator(".task-title"));
    await expect(
      group(page, "priority", "high").getByRole("status"),
    ).toHaveText("Move to High priority");
    await page.mouse.up();
    await expect
      .poll(() => storedTask(page, "a"))
      .toEqual({ ...before, priority: "high" });
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => storedTask(page, "a")).toEqual(before);
    await startDrag(page);
    await expect(group(page, "priority", "medium")).toBeVisible();
    await over(page, group(page, "priority", "medium"));
    await page.mouse.up();
    await expect
      .poll(() => storedTask(page, "a"))
      .toEqual({ ...before, priority: "medium" });
  });

  test(`${layout}: explicit date drops preserve times, clearing and date picker cancellation`, async ({
    page,
  }) => {
    await seed(page, board, "/tasks?group=schedule");
    const before = await storedTask(page, "a");
    await startDrag(page);
    await over(page, card(page, "b").locator(".task-title"));
    await page.mouse.up();
    await expect
      .poll(() => storedTask(page, "a"))
      .toEqual({
        ...before,
        schedule: { ...before.schedule, date: "2026-10-11" },
      });
    const moved = await storedTask(page, "a");
    await startDrag(page);
    await over(page, page.locator('[data-date-drop-target="schedule"]'));
    await page.mouse.up();
    await expect(
      page.getByRole("dialog", { name: "Choose scheduled date" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await storedTask(page, "a")).toEqual(moved);
    await startDrag(page);
    await over(page, page.locator('[data-date-drop-target="schedule"]'));
    await page.mouse.up();
    await page
      .getByRole("dialog", { name: "Choose scheduled date" })
      .getByRole("button", { name: /October 15th, 2026/ })
      .click();
    await expect
      .poll(async () => (await storedTask(page, "a")).schedule)
      .toEqual({ ...before.schedule, date: "2026-10-15" });
    await startDrag(page);
    await over(page, group(page, "schedule", null));
    await page.mouse.up();
    await expect
      .poll(async () => (await storedTask(page, "a")).schedule)
      .toBeUndefined();
    expect((await storedTask(page, "a")).deadline).toEqual(before.deadline);
  });

  test(`${layout}: aggregate overviews prohibit cross-group date drops and Escape cancels`, async ({
    page,
  }) => {
    await seed(page, board, "/upcoming");
    const before = await storedTask(page, "a");
    await expect(
      group(page, "upcoming", "2026-10-10")
        .locator('[data-slot="badge"]')
        .filter({ hasText: "Scheduled" }),
    ).toBeVisible();
    await expect(
      group(page, "upcoming", "2026-10-12")
        .locator('[data-slot="badge"]')
        .filter({ hasText: "Due" }),
    ).toBeVisible();
    await startDrag(page);
    await over(page, group(page, "upcoming", "2026-10-11"));
    await page.mouse.up();
    expect(await storedTask(page, "a")).toEqual(before);
    await page.goto("/tasks?group=priority");
    await startDrag(page);
    await over(page, group(page, "priority", "high"));
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(await storedTask(page, "a")).toEqual(before);
  });

  test(`${layout}: keyboard drag follows the grouping without changing hierarchy`, async ({
    page,
  }) => {
    await seed(page, board, "/tasks?group=priority");
    const before = await storedTask(page, "a");
    await card(page, "a").focus();
    await page.keyboard.press("Space");
    if (board) {
      for (let step = 0; step < 8; step++) {
        await page.keyboard.press("ArrowRight");
        if (
          await group(page, "priority", "high").getByRole("status").isVisible()
        )
          break;
      }
      await expect(
        group(page, "priority", "high").getByRole("status"),
      ).toHaveText("Move to High priority");
      await page.keyboard.press("Space");
      await expect
        .poll(() => storedTask(page, "a"))
        .toEqual({ ...before, priority: "high" });
    } else {
      const lowStatus = group(page, "priority", "low").getByRole("status");
      for (let step = 0; step < 8; step++) {
        await page.keyboard.press("ArrowDown");
        if (await lowStatus.isVisible()) break;
      }
      await expect(lowStatus).toHaveText("Update manual order");
      await page.keyboard.press("Space");
      await expect
        .poll(async () => {
          const task = await storedTask(page, "a");
          const other = await storedTask(page, "overdue");
          return task.order > other.order;
        })
        .toBe(true);
      expect(await storedTask(page, "a")).toMatchObject({
        priority: before.priority,
        parentId: before.parentId,
      });
      expect((await storedTask(page, "child")).parentId).toBe("a");
    }
  });

  test(`${layout}: project and status drops preserve unrelated fields and reject implicit detachment`, async ({
    page,
  }) => {
    await seed(page, board, "/tasks?group=project", true);
    const before = await storedTask(page, "a");
    await startDrag(page, "child");
    await over(page, card(page, "b").locator(".task-title"));
    await expect(group(page, "project", "q").getByRole("status")).toContainText(
      "location controls",
    );
    await page.mouse.up();
    expect((await storedTask(page, "child")).parentId).toBe("a");
    await startDrag(page);
    await over(page, card(page, "overdue").locator(".task-title"));
    await page.mouse.up();
    await expect
      .poll(() => storedTask(page, "a"))
      .toEqual({ ...before, projectId: null, sectionId: null });
    await page.goto("/tasks?group=status&status=all");
    const moved = await storedTask(page, "a");
    await page.getByRole("checkbox", { name: "Complete Beta" }).click();
    await startDrag(page);
    await over(page, card(page, "b").locator(".task-title"));
    await page.mouse.up();
    await expect
      .poll(() => storedTask(page, "a"))
      .toEqual({ ...moved, completed: true });
    await expect(
      group(page, "status", "completed").getByRole("button", {
        name: /Add task/,
      }),
    ).toHaveCount(0);
    await startDrag(page);
    await over(page, card(page, "overdue").locator(".task-title"));
    await page.mouse.up();
    await expect.poll(() => storedTask(page, "a")).toEqual(moved);
  });

  test(`${layout}: manual order previews agree with commit and automatic order rejects reordering`, async ({
    page,
  }) => {
    await seed(page, board, "/tasks?group=priority");
    await startDrag(page, "overdue");
    await over(page, card(page, "a").locator(".task-title"));
    await expect(group(page, "priority", "low").getByRole("status")).toHaveText(
      "Update manual order",
    );
    await expect(
      group(page, "priority", "low").locator("[data-task-ref]").first(),
    ).toHaveAttribute("data-task-ref", JSON.stringify(["overdue"]));
    await page.mouse.up();
    await expect
      .poll(
        async () =>
          (await storedTask(page, "overdue")).order <
          (await storedTask(page, "a")).order,
      )
      .toBe(true);
    await page.goto("/tasks?group=priority&sort=title");
    const before = await stored(page);
    await startDrag(page, "overdue");
    await over(page, card(page, "a").locator(".task-title"));
    await expect(group(page, "priority", "low").getByRole("status")).toHaveText(
      "Switch to Manual order to reorder tasks within this group.",
    );
    await page.mouse.up();
    expect((await stored(page)).tasks).toEqual(before.tasks);
    await startDrag(page);
    await over(page, group(page, "priority", "high"));
    await page.mouse.move(1495, 2, { steps: 10 });
    await page.mouse.up();
    expect((await stored(page)).tasks).toEqual(before.tasks);
  });
}

test("Calendar still preserves explicit creation slots and timed drag behavior", async ({
  page,
}) => {
  await seed(page, false, "/tasks");
  await page.goto("/calendar?mode=day&date=2026-10-10");
  const slot = page.getByRole("button", {
    name: "Schedule on 2026-10-10 at 11:00",
    exact: true,
  });
  await slot.dblclick();
  const editor = page.getByRole("dialog", { name: "Create task", exact: true });
  await expect(
    editor.getByRole("button", { name: /Schedule: Today.*11am/ }),
  ).toBeVisible();
  await editor
    .getByRole("textbox", { name: "Task title" })
    .fill("Calendar created");
  await editor
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await stored(page)).tasks.find(
          (t: { title: string }) => t.title === "Calendar created",
        )?.schedule,
    )
    .toEqual({ date: "2026-10-10", time: "11:00", duration: 30 });
  const before = await storedTask(page, "a");
  const handle = page.getByRole("button", { name: "Drag Alpha", exact: true });
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 12,
    box.y + box.height / 2 + 12,
    { steps: 5 },
  );
  await over(
    page,
    page.getByRole("button", {
      name: "Schedule on 2026-10-10 at 12:00",
      exact: true,
    }),
  );
  // Calendar uses its existing card-shape collision strategy. The highlighted
  // slot, rather than the pointer's position within a long card, is the target.
  const highlightedSlot = page.locator('.time-slot[class*="outline-2!"]');
  await expect(highlightedSlot).toHaveCount(1);
  const selectedTime = (await highlightedSlot
    .getByRole("button")
    .getAttribute("aria-label"))!.split(" at ")[1];
  expect(selectedTime).not.toBe(before.schedule.time);
  await page.mouse.up();
  await expect
    .poll(() => storedTask(page, "a"))
    .toEqual({
      ...before,
      schedule: { ...before.schedule, time: selectedTime },
    });
});

test("view grouping menus, flat subtasks, status explanation, and range controls", async ({
  page,
}) => {
  await seed(page, true, "/today?group=deadline");
  await page
    .getByRole("button", { name: "Group tasks by Today and overdue" })
    .click();
  await expect(page.getByRole("menuitemradio")).toHaveText([
    "Today and overdue",
    "Project",
    "Priority",
    "No grouping",
  ]);
  await page.keyboard.press("Escape");
  await expect(
    group(page, "today", "overdue").getByRole("button", { name: /Add task/ }),
  ).toHaveCount(0);
  await page.goto("/tasks?group=priority");
  await expect(
    group(page, "priority", "high").getByRole("button", {
      name: "Edit Child",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator(`[data-task-ref='${JSON.stringify(["child"])}']`),
  ).toHaveCount(1);
  await page.goto("/tasks?group=status");
  await page.getByRole("button", { name: "Show all statuses" }).click();
  await expect(page).toHaveURL(/status=all/);
  await page.goto("/upcoming?range=60");
  await expect(
    page.getByRole("combobox", { name: "Upcoming range" }),
  ).toContainText("Next 365 days");
  await expect(
    page.getByRole("button", { name: "Switch to list" }),
  ).toBeVisible();
  await expect(group(page, "upcoming", "2026-10-10")).toHaveAttribute(
    "aria-label",
    "Saturday, Oct 10, 2026",
  );
  await page.getByRole("combobox", { name: "Upcoming range" }).click();
  await page.getByRole("option", { name: "Next 7 days", exact: true }).click();
  await expect(
    page.getByText("Oct 10, 2026 – Oct 16, 2026", { exact: true }),
  ).toBeVisible();
});
