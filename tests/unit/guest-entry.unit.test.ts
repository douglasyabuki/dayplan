import { expect, test } from "vitest";

import { safeWorkspaceDestination } from "@/lib/workspace/entry";

const origin = "https://dayplan.test";

test.each([
  "/today",
  "/calendar?mode=day&date=2026-10-10#task",
  "/projects/work",
  "/tags/weekly",
  "https://dayplan.test/inbox?sort=title#task",
])("preserves workspace destination %s", (value) => {
  expect(safeWorkspaceDestination(value, origin)).toBe(
    value.replace(origin, ""),
  );
});

test.each([
  null,
  "",
  "/welcome",
  "/sign-in",
  "//evil.test/inbox",
  "https://evil.test/today",
  "javascript:alert(1)",
  "/projects/%ZZ",
  "/inbox/extra",
  "/\\evil.test/today",
  "https://user:pass@dayplan.test/today",
  "\n/today",
])("rejects unsafe or unsupported destination %s", (value) => {
  expect(safeWorkspaceDestination(value, origin)).toBe("/today");
});
