import assert from "node:assert/strict";

import { test } from "vitest";

import { domain } from "./task-fixtures";
const { compactTiming, scheduleLabel, deadlineLabel } = domain;
test("compact timing combines matching dates and preserves distinct deadlines", () => {
  const today = "2026-10-03";
  const schedule = { date: "2026-10-04", time: "09:00", duration: 20 };
  assert.deepEqual(
    compactTiming(schedule, { date: "2026-10-04", time: "09:30" }, today),
    {
      scheduled: "Tomorrow · 9–9:20am",
      due: "due 9:30am",
    },
  );
  assert.deepEqual(
    compactTiming(schedule, { date: "2026-10-05", time: "09:30" }, today),
    {
      scheduled: "Tomorrow · 9–9:20am",
      due: "due Oct 5 9:30am",
    },
  );
  assert.deepEqual(compactTiming(undefined, { date: today }, today), {
    scheduled: "",
    due: "due Today",
  });
  assert.deepEqual(compactTiming(undefined, undefined, today), {
    scheduled: "",
    due: "",
  });
  assert.deepEqual(compactTiming(schedule, undefined, today), {
    scheduled: "Tomorrow · 9–9:20am",
    due: "",
  });
});

test("compact timing retains all-day, meridiem changes, and overnight context", () => {
  const today = "2026-10-03";
  assert.deepEqual(
    compactTiming({ date: today, duration: 20 }, { date: today }, today),
    {
      scheduled: "Today · All day",
      due: "due that day",
    },
  );
  assert.equal(
    compactTiming(
      { date: today, time: "23:50", duration: 20 },
      undefined,
      today,
    ).scheduled,
    "Today · 11:50pm–12:10am (+1 day)",
  );
  assert.equal(
    compactTiming(
      { date: today, time: "11:50", duration: 20 },
      undefined,
      today,
    ).scheduled,
    "Today · 11:50am–12:10pm",
  );
});

test("schedule summaries distinguish all-day, timed, and midnight-crossing work", () => {
  assert.equal(
    scheduleLabel({ date: "2026-10-03", duration: 30 }, "2026-10-03"),
    "Scheduled Today · All day",
  );
  assert.equal(
    scheduleLabel(
      { date: "2026-10-04", time: "09:00", duration: 90 },
      "2026-10-03",
    ),
    "Scheduled Tomorrow · 9am–10:30am",
  );
  assert.equal(
    scheduleLabel(
      { date: "2026-10-03", time: "23:45", duration: 30 },
      "2026-10-03",
    ),
    "Scheduled Today · 11:45pm–12:15am (+1 day)",
  );
  assert.equal(
    scheduleLabel(
      { date: "2026-10-03", time: "23:00", duration: 60 },
      "2026-10-03",
    ),
    "Scheduled Today · 11pm–12am (+1 day)",
  );
  assert.equal(
    deadlineLabel({ date: "2026-10-03", time: "17:00" }, "2026-10-03"),
    "Due Today · 5pm",
  );
});
