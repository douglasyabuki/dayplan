import { expect, test } from "vitest";

import { referenceKey } from "@/lib/tasks/recurrence";
import { mergeGuestWorkspace } from "@/lib/workspace/import";
import { seedWorkspace } from "@/lib/workspace/seed";
import { validateWorkspace } from "@/stores/workspace/validation";

test("import remaps colliding IDs, nested references, exceptions and project layouts", () => {
  const guest = seedWorkspace();
  const root = guest.tasks.find((t) => t.recurrence)!;
  const ref = {
    taskId: root.id,
    context: {
      recurrenceRootTaskId: root.id,
      occurrenceDate: root.schedule!.date,
    },
  };
  guest.exceptions[referenceKey(ref)] = {
    ...ref,
    overrides: { title: "Guest occurrence" },
  };
  guest.layouts[`project:${guest.projects[0].id}`] = "board";
  const account = { ...seedWorkspace(), theme: "dark" as const };
  const before = structuredClone(account);
  let count = 0;
  const merged = mergeGuestWorkspace(
    account,
    guest,
    () => `imported-${++count}`,
  );
  expect(account).toEqual(before);
  expect(merged.theme).toBe("dark");
  expect(merged.tasks.slice(0, account.tasks.length)).toEqual(account.tasks);
  const copiedRoot = merged.tasks
    .slice(account.tasks.length)
    .find((t) => t.title === root.title)!;
  const exception = Object.values(merged.exceptions)[0];
  expect(exception.taskId).toBe(copiedRoot.id);
  expect(exception.context?.recurrenceRootTaskId).toBe(copiedRoot.id);
  const importedProject = merged.projects[account.projects.length];
  expect(merged.layouts[`project:${importedProject.id}`]).toBe("board");
  expect(validateWorkspace(merged)).toEqual(merged);
});

test("validation rejects duplicate project IDs and dangling task tags", () => {
  const duplicate = seedWorkspace();
  duplicate.projects.push(duplicate.projects[0]);
  expect(() => validateWorkspace(duplicate)).toThrow();
  const dangling = seedWorkspace();
  dangling.tasks[0].tagIds = ["missing"];
  expect(() => validateWorkspace(dangling)).toThrow();
});
