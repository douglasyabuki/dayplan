import { afterEach, expect, test, vi } from "vitest";

import { emptyWorkspace } from "@/lib/workspace/empty";
import { WorkspacePersistenceSession } from "@/stores/workspace/persistence-session";

afterEach(() => vi.useRealTimers());

test("flush reports activity and confirms the latest edit before inspection", async () => {
  const events: string[] = [];
  const save = vi.fn(async () => {
    events.push("save");
  });
  const source = {
    owner: { kind: "account" as const, userId: "sync" },
    load: () => emptyWorkspace(),
    save,
  };
  const scope = new WorkspacePersistenceSession(source, vi.fn(), () =>
    events.push(
      scope.status.saving
        ? "Saving"
        : scope.status.pending
          ? "Pending"
          : "Saved",
    ),
  );
  scope.load(vi.fn(), vi.fn());
  scope.saveLatest({ ...emptyWorkspace(), theme: "dark" });
  expect(scope.status.pending).toBe(true);
  await scope.flush(Date.now() + 2000);
  await scope.inspect(async () => {
    events.push("read");
  });
  expect(events.indexOf("save")).toBeLessThan(events.indexOf("read"));
  expect(events).toContain("Saving");
  expect(scope.status).toEqual({ pending: false, saving: false });
  scope.close();
});

test("failed flush retains edits and successful retry restores scheduling", async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(
      Object.assign(new Error("Offline"), { code: "network_error" }),
    )
    .mockResolvedValue(undefined);
  const source = {
    owner: { kind: "account" as const, userId: "retry" },
    load: () => emptyWorkspace(),
    save,
  };
  const scope = new WorkspacePersistenceSession(source, vi.fn());
  scope.load(vi.fn(), vi.fn());
  scope.saveLatest({ ...emptyWorkspace(), theme: "dark" });
  await expect(scope.flush(Date.now() + 2000)).rejects.toThrow("Offline");
  expect(scope.status.pending).toBe(true);
  await scope.flush(Date.now() + 2000);
  expect(scope.writable).toBe(true);
  expect(scope.status.pending).toBe(false);
  scope.close();
});

test("expired inspection cannot run later after the source lane clears", async () => {
  let finish!: () => void;
  const source = {
    owner: { kind: "account" as const, userId: "deadline" },
    load: () => emptyWorkspace(),
    save: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  };
  const scope = new WorkspacePersistenceSession(source, vi.fn());
  scope.load(vi.fn(), vi.fn());
  scope.retry(emptyWorkspace(), vi.fn());
  const read = vi.fn(async () => null);
  await expect(scope.inspect(read, Date.now() + 10)).rejects.toThrow();
  finish();
  await Promise.resolve();
  await Promise.resolve();
  expect(read).not.toHaveBeenCalled();
  scope.close();
});
