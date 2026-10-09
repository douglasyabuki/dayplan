import { expect, test } from "vitest";

import { layoutDay } from "@/lib/calendar/layout";
import { asOccurrence } from "@/lib/tasks/recurrence";
import { task } from "@/tests/task-fixtures";

const day = "2026-10-09";
const timed = (id: string, time: string, duration: number, date = day) =>
  asOccurrence(task(id, { schedule: { date, time, duration } }));

test("overlapping events share cluster width and touching events reuse lanes", () => {
  const tasks = [
    timed("long", "09:00", 120),
    timed("first", "09:30", 30),
    timed("second", "10:00", 30),
    timed("separate", "11:00", 30),
  ];
  const before = structuredClone(tasks);
  expect(
    layoutDay(tasks, day).map(({ task, lane, lanes }) => [
      task.id,
      lane,
      lanes,
    ]),
  ).toEqual([
    [tasks[0].id, 0, 2],
    [tasks[1].id, 1, 2],
    [tasks[2].id, 1, 2],
    [tasks[3].id, 0, 1],
  ]);
  expect(tasks).toEqual(before);
});

test("midnight segments clip to each day while retaining scheduling offsets", () => {
  const event = timed("overnight", "23:30", 120);
  expect(layoutDay([event], day)[0]).toMatchObject({
    start: 1410,
    end: 1440,
    dayOffset: 0,
  });
  expect(layoutDay([event], "2026-10-10")[0]).toMatchObject({
    start: 0,
    end: 90,
    dayOffset: 1,
  });
  expect(layoutDay([event], "2026-10-11")).toEqual([]);
});

test("all-day and deadline-only tasks do not occupy timed lanes", () => {
  expect(
    layoutDay(
      [
        asOccurrence(
          task("all-day", { schedule: { date: day, duration: 30 } }),
        ),
        asOccurrence(
          task("deadline", { deadline: { date: day, time: "09:00" } }),
        ),
        timed("tomorrow", "09:00", 30, "2026-10-10"),
      ],
      day,
    ),
  ).toEqual([]);
});
