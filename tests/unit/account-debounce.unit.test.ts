import { afterEach, expect, test, vi } from "vitest";

import { emptyWorkspace } from "@/lib/workspace/empty";
import { WorkspacePersistenceSession } from "@/stores/workspace/persistence-session";

afterEach(() => vi.useRealTimers());

function harness(immediateSaving = false) {
  vi.useFakeTimers();
  const save = vi.fn().mockResolvedValue(undefined);
  const stage = vi.fn().mockResolvedValue(undefined);
  const source = {
    owner: { kind: "account" as const, userId: "timing" },
    immediateSaving,
    load: () => emptyWorkspace(),
    save,
    stage,
  };
  const scope = new WorkspacePersistenceSession(source, vi.fn());
  scope.load(vi.fn(), vi.fn());
  return { scope, save, stage, source };
}

test("each edit restarts idle, while recovery stages immediately", async () => {
  const { scope, save, stage } = harness();
  scope.saveLatest({ ...emptyWorkspace(), theme: "dark" });
  expect(stage).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(9000);
  scope.saveLatest({ ...emptyWorkspace(), theme: "light" });
  await vi.advanceTimersByTimeAsync(9999);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0][0].theme).toBe("light");
  scope.close();
});

test("continuous edits save at sixty seconds from the first unsaved edit", async () => {
  const { scope, save } = harness();
  scope.saveLatest(emptyWorkspace());
  for (let n = 0; n < 6; n++) {
    await vi.advanceTimersByTimeAsync(9000);
    scope.saveLatest({ ...emptyWorkspace(), timezone: `edit-${n}` });
  }
  await vi.advanceTimersByTimeAsync(5999);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledOnce();
  scope.close();
});

test("edits during an active save start a new maximum window and expired work drains immediately", async () => {
  const { scope, save } = harness();
  let finish!: () => void;
  save.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  scope.saveLatest(emptyWorkspace());
  await vi.advanceTimersByTimeAsync(10000);
  scope.saveLatest({ ...emptyWorkspace(), theme: "dark" });
  for (let n = 0; n < 7; n++) {
    await vi.advanceTimersByTimeAsync(9000);
    scope.saveLatest({ ...emptyWorkspace(), timezone: `active-${n}` });
  }
  expect(save).toHaveBeenCalledOnce();
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0].timezone).toBe("active-6");
  scope.close();
});

test("unexpired deadlines retain their remaining time after a save completes", async () => {
  const { scope, save } = harness();
  let finish!: () => void;
  save.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  scope.saveLatest(emptyWorkspace());
  await vi.advanceTimersByTimeAsync(10000);
  scope.saveLatest({ ...emptyWorkspace(), theme: "dark" });
  await vi.advanceTimersByTimeAsync(3000);
  finish();
  await vi.advanceTimersByTimeAsync(6999);
  expect(save).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledTimes(2);
  scope.close();
});

test("storage failure switches to immediate serialized saves and cleanup cancels timers", async () => {
  const { scope, save, source } = harness();
  scope.saveLatest(emptyWorkspace());
  source.immediateSaving = true;
  scope.saveLatest({ ...emptyWorkspace(), theme: "dark" });
  await vi.advanceTimersByTimeAsync(0);
  expect(save).toHaveBeenCalled();
  source.immediateSaving = false;
  scope.saveLatest({ ...emptyWorkspace(), theme: "light" });
  scope.close();
  const calls = save.mock.calls.length;
  await vi.advanceTimersByTimeAsync(60000);
  expect(save).toHaveBeenCalledTimes(calls);
});
