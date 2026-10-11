import { expect, test, vi } from "vitest";

import { seedWorkspace } from "@/lib/workspace/seed";
import { guestOwner } from "@/stores/session/model";
import type { WorkspaceDataSource } from "@/stores/workspace/data-source";
import { WorkspacePersistenceSession } from "@/stores/workspace/persistence-session";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const snapshot = (name: string) => ({ ...seedWorkspace(), timezone: name });
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

test("synchronous guest saves stay synchronous and raw snapshots are passed unchanged", () => {
  const original = seedWorkspace();
  const save = vi.fn();
  const source: WorkspaceDataSource = {
    owner: guestOwner,
    load: () => original,
    save,
  };
  const scope = new WorkspacePersistenceSession(source, vi.fn());
  const loaded = vi.fn();
  scope.load(loaded, vi.fn());
  expect(loaded).toHaveBeenCalledWith(original);
  scope.saveLatest(original);
  expect(save).toHaveBeenCalledWith(original, expect.any(AbortSignal));
  scope.close();
});

test("serializes asynchronous saves and coalesces pending snapshots", async () => {
  const first = deferred<void>();
  const save = vi
    .fn()
    .mockImplementationOnce(() => first.promise)
    .mockReturnValue(undefined);
  const source: WorkspaceDataSource = {
    owner: guestOwner,
    load: () => null,
    save,
  };
  const scope = new WorkspacePersistenceSession(source, vi.fn());
  scope.load(vi.fn(), vi.fn());
  const a = snapshot("a"),
    b = snapshot("b"),
    c = snapshot("c");
  scope.saveLatest(a);
  scope.saveLatest(b);
  scope.saveLatest(c);
  expect(save).toHaveBeenCalledTimes(1);
  first.resolve();
  await flush();
  expect(save.mock.calls.map(([value]) => value)).toEqual([a, c]);
  scope.close();
});

test("write failure stops automatic saves, while successful reset restores persistence", async () => {
  const pending = deferred<void>();
  const errors = vi.fn();
  const save = vi
    .fn()
    .mockImplementationOnce(() => pending.promise)
    .mockReturnValue(undefined);
  const scope = new WorkspacePersistenceSession(
    { owner: guestOwner, load: () => null, save },
    errors,
  );
  scope.load(vi.fn(), vi.fn());
  scope.saveLatest(snapshot("a"));
  scope.saveLatest(snapshot("b"));
  pending.reject(new Error("Quota"));
  await flush();
  scope.saveLatest(snapshot("c"));
  expect(save).toHaveBeenCalledTimes(1);
  expect(errors).toHaveBeenCalledWith(expect.stringContaining("session"));
  const reset = vi.fn();
  scope.reset(seedWorkspace(), reset);
  expect(reset).toHaveBeenCalledOnce();
  scope.saveLatest(snapshot("d"));
  expect(save).toHaveBeenCalledTimes(3);
  scope.close();
});

test("returning owner waits for uncancellable old writes and discards old queued edits", async () => {
  const write = deferred<void>();
  let stored = snapshot("original");
  const save = vi.fn((value) =>
    write.promise.then(() => {
      stored = value;
    }),
  );
  const source: WorkspaceDataSource = {
    owner: guestOwner,
    load: vi.fn(() => stored),
    save,
  };
  const old = new WorkspacePersistenceSession(source, vi.fn());
  old.load(vi.fn(), vi.fn());
  const accepted = snapshot("accepted");
  old.saveLatest(accepted);
  old.saveLatest(snapshot("discarded"));
  old.close();
  const loaded = vi.fn();
  const next = new WorkspacePersistenceSession(source, vi.fn());
  next.load(loaded, vi.fn());
  expect(loaded).not.toHaveBeenCalled();
  write.resolve();
  await flush();
  expect(loaded).toHaveBeenCalledWith(accepted);
  expect(save).toHaveBeenCalledTimes(1);
  old.saveLatest(snapshot("stale callback"));
  expect(save).toHaveBeenCalledTimes(1);
  next.close();
});

test("late load/save/reset responses and errors cannot call a departed owner's handlers", async () => {
  const load = deferred<null>();
  const loaded = vi.fn(),
    failed = vi.fn(),
    errors = vi.fn();
  const scope = new WorkspacePersistenceSession(
    { owner: guestOwner, load: () => load.promise, save: vi.fn() },
    errors,
  );
  scope.load(loaded, failed);
  scope.close();
  load.resolve(null);
  await flush();
  expect(loaded).not.toHaveBeenCalled();
  expect(failed).not.toHaveBeenCalled();
  const save = deferred<void>();
  const reset = vi.fn();
  const other = new WorkspacePersistenceSession(
    {
      owner: { kind: "account", userId: "a" },
      load: () => null,
      save: () => save.promise,
    },
    errors,
  );
  other.reset(seedWorkspace(), reset);
  other.close();
  save.reject(new Error("Late"));
  await flush();
  expect(reset).not.toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
});

test("reset is ordered behind an outstanding save and failed reset keeps automatic writes disabled", async () => {
  const write = deferred<void>();
  const errors = vi.fn(),
    reset = vi.fn();
  const save = vi
    .fn()
    .mockImplementationOnce(() => write.promise)
    .mockImplementationOnce(() => {
      throw new Error("Reset failed");
    });
  const scope = new WorkspacePersistenceSession(
    { owner: guestOwner, load: () => null, save },
    errors,
  );
  scope.load(vi.fn(), vi.fn());
  scope.saveLatest(snapshot("a"));
  scope.saveLatest(snapshot("b"));
  scope.reset(snapshot("reset"), reset);
  expect(save).toHaveBeenCalledTimes(1);
  write.resolve();
  await flush();
  expect(save).toHaveBeenCalledTimes(2);
  expect(reset).not.toHaveBeenCalled();
  expect(errors).toHaveBeenCalledWith(
    "Storage is still unavailable. Reset was not saved.",
  );
  scope.close();
});
