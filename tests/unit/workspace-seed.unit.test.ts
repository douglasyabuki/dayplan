import { afterEach, expect, test, vi } from "vitest";

import { seedWorkspace } from "@/lib/workspace/seed";
import { validateWorkspace } from "@/stores/workspace/validation";

afterEach(() => vi.useRealTimers());

test("sample dates use the selected workspace timezone across the date boundary", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T15:30:00Z"));
  const utc = seedWorkspace("UTC");
  const auckland = seedWorkspace("Pacific/Auckland");
  expect(utc.tasks[0].deadline?.date).toBe("2026-10-12");
  expect(auckland.tasks[0].deadline?.date).toBe("2026-10-13");
  expect(auckland.timezone).toBe("Pacific/Auckland");
  expect(validateWorkspace(auckland)).toEqual(auckland);
});
