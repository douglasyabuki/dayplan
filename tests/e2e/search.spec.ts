import { expect, test } from "./fixtures";

test("search debounces full text without server requests and restores URL queries", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("dayplan.onboarding.v1", "complete");
    localStorage.setItem(
      "dayplan.workspace.v2",
      JSON.stringify({
        version: 2,
        timezone: "UTC",
        theme: "light",
        exceptions: {},
        tags: [],
        projects: [],
        sections: [],
        layouts: {},
        tasks: ["Alpha", "Beta"].map((title, order) => ({
          id: title,
          title,
          order,
          parentId: null,
          description: "",
          projectId: null,
          sectionId: null,
          tagIds: [],
          priority: "none",
          completed: false,
          archived: false,
          createdAt: "2026-10-01",
        })),
      }),
    );
  });
  await page.goto("/search?sort=title#results");
  const input = page.getByRole("textbox", { name: "Search all tasks" });
  await expect(input).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Beta", exact: true }),
  ).toBeVisible();
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1000));
  const requests: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/search" &&
      request.headers()["next-router-prefetch"] !== "1"
    )
      requests.push(request.url());
  });

  await input.pressSequentially("Al");
  await page.clock.fastForward(200);
  await input.pressSequentially("pha");
  await expect(input).toHaveValue("Alpha");
  await page.clock.fastForward(299);
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  await page.clock.fastForward(1);
  await expect(page).toHaveURL(/sort=title&q=Alpha#results$/);
  await expect(
    page.getByRole("button", { name: "Edit Alpha", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Beta", exact: true }),
  ).toHaveCount(0);
  await expect(input).toBeFocused();

  await input.fill("");
  await page.clock.fastForward(300);
  await expect(page).toHaveURL(/\/search\?sort=title#results$/);
  await expect(
    page.getByRole("button", { name: "Edit Beta", exact: true }),
  ).toBeVisible();
  expect(requests).toEqual([]);

  await page.evaluate(() =>
    window.history.pushState(null, "", "/search?q=Beta"),
  );
  await expect(input).toHaveValue("Beta");
  await input.fill("pending");
  await page.goBack();
  await expect(input).toHaveValue("");
  await page.clock.fastForward(300);
  await expect(page).toHaveURL(/\/search\?sort=title#results$/);

  await input.fill("cancelled");
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await page.clock.fastForward(300);
  await expect(page).toHaveURL(/\/inbox$/);
});
