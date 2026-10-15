import { afterEach, expect, test, vi } from "vitest";

import { emptyWorkspace } from "@/lib/workspace/empty";
import {
  AccountWorkspaceDataSource,
  PersistenceError,
} from "@/stores/workspace/account-data-source";
import {
  accountCoordinated,
  bounded,
  CoordinationError,
} from "@/stores/workspace/coordination";
import { WorkspacePersistenceSession } from "@/stores/workspace/persistence-session";
import {
  listRecovery,
  readRecovery,
  type RecoveryRecord,
  writeRecovery,
} from "@/stores/workspace/recovery-journal";
import type { Workspace } from "@/types-and-constants/workspace";

const sessions: WorkspacePersistenceSession[] = [];

afterEach(() => {
  sessions.splice(0).forEach((scope) => scope.close());
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function persistenceHarness() {
  const remote = server();
  const source = new AccountWorkspaceDataSource(remote.connection);
  const onError = vi.fn();
  const scope = new WorkspacePersistenceSession(source, onError);
  sessions.push(scope);
  const baseline = await new Promise<Workspace | null>((resolve, reject) =>
    scope.load(resolve, reject),
  );
  const signal = new AbortController().signal;
  const edit = {
    ...baseline!,
    tags: [
      { id: "edit", name: "Edited", color: "sky", parentId: null, order: 0 },
    ],
  } satisfies Workspace;
  return { remote, source, scope, signal, baseline: baseline!, edit, onError };
}

test("real account staging cancels queued undo only after durable recovery cleanup", async () => {
  const { remote, source, scope, signal, baseline, edit } =
    await persistenceHarness();
  vi.useFakeTimers();
  scope.saveLatest(edit);
  await source.stage(edit, signal);
  scope.saveLatest(baseline);
  expect(scope.status.pending).toBe(true);
  await source.stage(baseline, signal);
  await expect.poll(() => scope.status.pending).toBe(false);
  expect(source.isSaved(baseline)).toBe(true);
  expect(await listRecovery(remote.connection.owner.userId, signal)).toEqual(
    [],
  );
  await vi.advanceTimersByTimeAsync(60000);
  expect(remote.bodies).toEqual([]);
  scope.close();
  vi.useRealTimers();
  const reopened = new AccountWorkspaceDataSource(remote.connection);
  expect(await reopened.load(signal)).toEqual(baseline);
  expect(remote.bodies).toEqual([]);
});

test("delayed cancellation cannot erase a newer edit from recovery or reopening", async () => {
  const { remote, source, scope, signal, baseline, edit } =
    await persistenceHarness();
  scope.saveLatest(edit);
  await source.stage(edit, signal);
  const [record] = await listRecovery(remote.connection.owner.userId, signal);
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = navigator.locks.request(
    `dayplan:journal:${record.userId}:${record.writerId}`,
    async () => {
      started();
      await gate;
    },
  );
  await ready;
  const newer = { ...edit, tags: [{ ...edit.tags[0], name: "Newer" }] };
  try {
    scope.saveLatest(baseline);
    scope.saveLatest(newer);
  } finally {
    release();
  }
  await held;
  await source.stage(newer, signal);
  expect(scope.status.pending).toBe(true);
  expect(source.recoverySnapshot).toEqual(newer);
  expect((await listRecovery(record.userId, signal))[0].latest).toEqual(newer);
  scope.close();
  const reopened = new AccountWorkspaceDataSource(remote.connection);
  expect(await reopened.load(signal)).toEqual(newer);
  expect(reopened.recoverySnapshot).toEqual(newer);
  expect(await listRecovery(record.userId, signal)).toEqual([]);
  expect(JSON.parse(remote.bodies.at(-1)!)).toMatchObject({ snapshot: newer });
});

test("an edit arriving during the tombstone transaction survives its late completion", async () => {
  const { remote, source, scope, signal, baseline, edit } =
    await persistenceHarness();
  scope.saveLatest(edit);
  await source.stage(edit, signal);
  const newer = { ...edit, tags: [{ ...edit.tags[0], name: "During commit" }] };
  const transaction = IDBDatabase.prototype.transaction;
  let intervened = false;
  const spy = vi
    .spyOn(IDBDatabase.prototype, "transaction")
    .mockImplementation(function (this: IDBDatabase, names, mode, options) {
      if (mode === "readwrite" && !intervened) {
        intervened = true;
        // persistNow already constructed the cancellation record, but its
        // transaction has not committed. This must also guard memory cleanup.
        scope.saveLatest(newer);
      }
      return transaction.call(this, names, mode, options);
    });
  scope.saveLatest(baseline);
  const cancellation = source.stage(baseline, signal);
  await cancellation;
  expect(intervened).toBe(true);
  expect(scope.status.pending).toBe(true);
  expect(source.recoverySnapshot).toEqual(newer);
  await source.stage(newer, signal);
  spy.mockRestore();
  const [record] = await listRecovery(remote.connection.owner.userId, signal);
  expect(record.latest).toEqual(newer);
  scope.close();
  expect(
    await new AccountWorkspaceDataSource(remote.connection).load(signal),
  ).toEqual(newer);
});

test("failed cancellation retains the restored snapshot and retryable immediate-save fallback", async () => {
  const { remote, source, scope, signal, baseline, edit, onError } =
    await persistenceHarness();
  scope.saveLatest(edit);
  await source.stage(edit, signal);
  const broken = vi
    .spyOn(IDBFactory.prototype, "open")
    .mockImplementation(() => {
      throw new Error("Quota");
    });
  const request = remote.connection.request;
  remote.connection.request = async <T,>(
    path: string,
    inner: AbortSignal,
    body?: unknown,
  ): Promise<T> => {
    if (body) throw new PersistenceError("network_error", "Offline");
    return request<T>(path, inner, body);
  };
  scope.saveLatest(baseline);
  await source.stage(baseline, signal);
  await expect.poll(() => onError.mock.calls.length).toBeGreaterThan(0);
  expect(source.immediateSaving).toBe(true);
  expect(source.recoveryStorageError).not.toBe("");
  expect(source.isSaved(baseline)).toBe(false);
  expect(source.recoverySnapshot).toEqual(baseline);
  broken.mockRestore();
  const [record] = await listRecovery(remote.connection.owner.userId, signal);
  expect(record.latest).toEqual(edit);
  remote.connection.request = request;
  await new Promise<void>((resolve) => scope.retry(baseline, resolve));
  expect(source.isSaved(baseline)).toBe(true);
  expect(source.recoveryStorageError).toBe("");
  expect(await listRecovery(record.userId, signal)).toEqual([]);
});

test.each([false, true])(
  "undo follows an older write with the baseline (lost response: %s)",
  async (loseResponse) => {
    const { remote, source, scope, signal, baseline, edit } =
      await persistenceHarness();
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const request = remote.connection.request;
    let first = true;
    remote.connection.request = async <T,>(
      path: string,
      inner: AbortSignal,
      body?: unknown,
    ): Promise<T> => {
      if (body && first) {
        first = false;
        started();
        await gate;
      }
      return request<T>(path, inner, body);
    };
    scope.saveLatest(edit);
    await source.stage(edit, signal);
    if (loseResponse) remote.lose();
    const sending = scope.flush(Date.now() + 2000);
    const outcome = sending.catch((error: unknown) => error);
    await ready;
    try {
      scope.saveLatest(baseline);
      await source.stage(baseline, signal);
      expect(source.isSaved(baseline)).toBe(false);
      expect(scope.status.pending).toBe(true);
      const [record] = await listRecovery(
        remote.connection.owner.userId,
        signal,
      );
      expect(record.latest).toEqual(baseline);
      expect(record.operation?.snapshot).toEqual(edit);
    } finally {
      release();
    }
    await outcome;
    await scope.flush(Date.now() + 2000);
    const bodies = remote.bodies.map((body) => JSON.parse(body));
    expect(bodies[0]).toMatchObject({ snapshot: edit, expectedRevision: 1 });
    if (loseResponse) expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies.at(-1)).toMatchObject({
      snapshot: baseline,
      expectedRevision: 2,
    });
    expect(source.isSaved(baseline)).toBe(true);
    expect(scope.status).toEqual({ pending: false, saving: false });
    scope.close();
    expect(
      await new AccountWorkspaceDataSource(remote.connection).load(signal),
    ).toEqual(baseline);
  },
);

function server(userId = crypto.randomUUID()) {
  let snapshot = emptyWorkspace();
  let revision = 1;
  const operations = new Map<string, number>();
  const bodies: string[] = [];
  let loseResponse = false;
  const connection = {
    owner: { kind: "account" as const, userId },
    sessionId: "verified-session",
    request: async <T,>(
      _path: string,
      _signal: AbortSignal,
      body?: unknown,
    ): Promise<T> => {
      if (!body) return { snapshot, revision } as T;
      const input = body as {
        operationId: string;
        expectedRevision: number;
        snapshot: Workspace;
      };
      bodies.push(JSON.stringify(input));
      let committed = operations.get(input.operationId);
      if (!committed) {
        if (input.expectedRevision !== revision)
          throw new PersistenceError("revision_conflict", "Conflict");
        snapshot = structuredClone(input.snapshot);
        committed = ++revision;
        operations.set(input.operationId, committed);
      }
      if (loseResponse) {
        loseResponse = false;
        throw new PersistenceError("network_error", "Lost response");
      }
      return { committedRevision: committed, currentRevision: revision } as T;
    },
  };
  return {
    connection,
    bodies,
    lose: () => {
      loseResponse = true;
    },
    externalEdit: () => {
      revision++;
    },
  };
}

test("reopening reconciles an exact unresolved payload before newer durable edits", async () => {
  const remote = server();
  const signal = new AbortController().signal;
  const first = new AccountWorkspaceDataSource(remote.connection);
  await first.load(signal);
  remote.lose();
  await expect(
    first.save({ ...emptyWorkspace(), theme: "dark" }, signal),
  ).rejects.toThrow();
  await first.stage({ ...emptyWorkspace(), theme: "light" }, signal);
  const journals = await listRecovery(remote.connection.owner.userId, signal);
  expect(journals[0].operation?.snapshot.theme).toBe("dark");
  expect(journals[0].latest?.theme).toBe("light");
  const reopened = new AccountWorkspaceDataSource(remote.connection);
  expect((await reopened.load(signal))?.theme).toBe("light");
  expect(remote.bodies[1]).toBe(remote.bodies[0]);
  expect(JSON.parse(remote.bodies[2])).toMatchObject({
    expectedRevision: 2,
    snapshot: { theme: "light" },
  });
  expect(await listRecovery(remote.connection.owner.userId, signal)).toEqual(
    [],
  );
});

test("an older response cannot clear edits staged during its request", async () => {
  const remote = server();
  const signal = new AbortController().signal;
  let finish!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const request = remote.connection.request;
  remote.connection.request = async <T,>(
    path: string,
    inner: AbortSignal,
    body?: unknown,
  ) => {
    if (body) {
      started();
      await gate;
    }
    return request<T>(path, inner, body);
  };
  const source = new AccountWorkspaceDataSource(remote.connection);
  await source.load(signal);
  const saving = source.save({ ...emptyWorkspace(), theme: "dark" }, signal);
  await ready;
  await source.stage({ ...emptyWorkspace(), theme: "light" }, signal);
  expect(await source.recoveryCovered(signal, Date.now() + 2000)).toBe(true);
  finish();
  await saving;
  const records = await listRecovery(remote.connection.owner.userId, signal);
  expect(records[0]).toMatchObject({
    latest: { theme: "light" },
    operation: null,
    baseRevision: 2,
  });
});

test("storage failure continues server saving and only unconfirmed work blocks departure", async () => {
  const remote = server();
  const signal = new AbortController().signal;
  const source = new AccountWorkspaceDataSource(remote.connection);
  await source.load(signal);
  const broken = vi
    .spyOn(IDBFactory.prototype, "open")
    .mockImplementation(() => {
      throw new Error("Quota");
    });
  await source.save({ ...emptyWorkspace(), theme: "dark" }, signal);
  expect(source.immediateSaving).toBe(true);
  expect(source.recoveryStorageError).toBeTruthy();
  expect(await source.recoveryCovered(signal, Date.now() + 2000)).toBe(true);
  remote.lose();
  await expect(
    source.save({ ...emptyWorkspace(), theme: "light" }, signal),
  ).rejects.toThrow();
  expect(await source.recoveryCovered(signal, Date.now() + 2000)).toBe(false);
  broken.mockRestore();
  await source.save({ ...emptyWorkspace(), theme: "light" }, signal);
  expect(source.immediateSaving).toBe(false);
});

test("recovery stops on conflicts and never reads another account's journal", async () => {
  const remote = server();
  const signal = new AbortController().signal;
  const source = new AccountWorkspaceDataSource(remote.connection);
  await source.load(signal);
  await source.stage({ ...emptyWorkspace(), theme: "dark" }, signal);
  const other = server();
  await new AccountWorkspaceDataSource(other.connection).load(signal);
  expect(other.bodies).toEqual([]);
  remote.externalEdit();
  await expect(
    new AccountWorkspaceDataSource(remote.connection).load(signal),
  ).rejects.toMatchObject({ code: "revision_conflict" });
  expect(
    (await listRecovery(remote.connection.owner.userId, signal))[0].latest
      ?.theme,
  ).toBe("dark");
});

test("compare-and-swap rejects stale journal updates", async () => {
  const signal = new AbortController().signal;
  const record: RecoveryRecord = {
    version: 1,
    userId: crypto.randomUUID(),
    writerId: crypto.randomUUID(),
    sequence: 1,
    generation: 1,
    baseRevision: 1,
    latest: emptyWorkspace(),
    operation: null,
  };
  await writeRecovery(record, 0, signal);
  await writeRecovery(
    {
      ...record,
      sequence: 2,
      generation: 2,
      latest: { ...emptyWorkspace(), theme: "dark" },
    },
    1,
    signal,
  );
  await expect(
    writeRecovery({ ...record, sequence: 2, latest: null }, 1, signal),
  ).rejects.toBeInstanceOf(CoordinationError);
  expect(
    (await readRecovery(record.userId, record.writerId, signal))?.generation,
  ).toBe(2);
});

test("stalled ownership expires without bypass and canceled acquisition cannot run later", async () => {
  const userId = crypto.randomUUID();
  let release!: () => void;
  let acquired!: () => void;
  const ready = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = navigator.locks.request(
    `dayplan:account:${userId}`,
    async () => {
      acquired();
      await gate;
    },
  );
  await ready;
  const send = vi.fn().mockResolvedValue(undefined);
  try {
    await expect(
      accountCoordinated(
        userId,
        new AbortController().signal,
        Date.now() + 50,
        send,
      ),
    ).rejects.toBeInstanceOf(CoordinationError);
    const controller = new AbortController();
    const attempt = accountCoordinated(
      userId,
      controller.signal,
      Date.now() + 10000,
      send,
    );
    controller.abort();
    await expect(attempt).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  } finally {
    release();
    await held;
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(send).not.toHaveBeenCalled();
});

test("interrupted recovery keeps the operation for an identical subsequent retry", async () => {
  const remote = server();
  const signal = new AbortController().signal;
  const first = new AccountWorkspaceDataSource(remote.connection);
  await first.load(signal);
  remote.lose();
  await expect(
    first.save({ ...emptyWorkspace(), theme: "dark" }, signal),
  ).rejects.toThrow();
  const request = remote.connection.request;
  remote.connection.request = async <T,>(
    path: string,
    inner: AbortSignal,
    body?: unknown,
  ) => {
    if (body)
      await new Promise<void>((_, reject) =>
        inner.addEventListener("abort", () => reject(inner.reason), {
          once: true,
        }),
      );
    return request<T>(path, inner, body);
  };
  await expect(
    bounded(signal, Date.now() + 100, (inner) =>
      new AccountWorkspaceDataSource(remote.connection).load(inner),
    ),
  ).rejects.toThrow();
  expect(
    (await listRecovery(remote.connection.owner.userId, signal))[0].operation,
  ).not.toBeNull();
  remote.connection.request = request;
  await new AccountWorkspaceDataSource(remote.connection).load(signal);
  expect(remote.bodies[1]).toBe(remote.bodies[0]);
});

test("cleanup cancellation does not discard an accepted edit's queued durable write", async () => {
  const remote = server();
  const source = new AccountWorkspaceDataSource(remote.connection);
  await source.load(new AbortController().signal);
  const controller = new AbortController();
  const staged = source.stage(
    { ...emptyWorkspace(), theme: "dark" },
    controller.signal,
  );
  controller.abort();
  await staged;
  const records = await listRecovery(
    remote.connection.owner.userId,
    new AbortController().signal,
  );
  expect(records[0].latest?.theme).toBe("dark");
  expect(remote.bodies).toEqual([]);
});

test("departure coverage rejects a journal missing the unresolved payload or frozen generation", async () => {
  const remote = server();
  const signal = new AbortController().signal;
  const source = new AccountWorkspaceDataSource(remote.connection);
  await source.load(signal);
  remote.lose();
  await expect(
    source.save({ ...emptyWorkspace(), theme: "dark" }, signal),
  ).rejects.toThrow();
  expect(await source.recoveryCovered(signal, Date.now() + 2000)).toBe(true);
  const record = (
    await listRecovery(remote.connection.owner.userId, signal)
  )[0];
  await writeRecovery(
    { ...record, sequence: record.sequence + 1, operation: null },
    record.sequence,
    signal,
  );
  expect(await source.recoveryCovered(signal, Date.now() + 2000)).toBe(false);
  const newer = await readRecovery(record.userId, record.writerId, signal);
  await writeRecovery(
    {
      ...newer!,
      sequence: newer!.sequence + 1,
      operation: record.operation,
      generation: record.generation + 1,
    },
    newer!.sequence,
    signal,
  );
  expect(await source.recoveryCovered(signal, Date.now() + 2000)).toBe(false);
});

test("malformed save acknowledgment leaves exact recovery for a valid retry", async () => {
  const remote = server();
  const signal = new AbortController().signal;
  const request = remote.connection.request;
  remote.connection.request = async <T,>(
    path: string,
    inner: AbortSignal,
    body?: unknown,
  ) => {
    const result = await request<T>(path, inner, body);
    return body ? ({ committedRevision: -1, currentRevision: 2 } as T) : result;
  };
  const source = new AccountWorkspaceDataSource(remote.connection);
  await source.load(signal);
  await expect(
    source.save({ ...emptyWorkspace(), theme: "dark" }, signal),
  ).rejects.toMatchObject({ code: "network_error" });
  expect(
    (await listRecovery(remote.connection.owner.userId, signal))[0].operation,
  ).not.toBeNull();
  remote.connection.request = request;
  await source.save({ ...emptyWorkspace(), theme: "dark" }, signal);
  expect(remote.bodies[1]).toBe(remote.bodies[0]);
});

test("competing writers serialize their requests without rebasing the losing edits", async () => {
  const remote = server();
  const signal = new AbortController().signal;
  const first = new AccountWorkspaceDataSource(remote.connection);
  const second = new AccountWorkspaceDataSource(remote.connection);
  await Promise.all([first.load(signal), second.load(signal)]);
  const outcomes = await Promise.allSettled([
    first.save({ ...emptyWorkspace(), theme: "dark" }, signal),
    second.save({ ...emptyWorkspace(), theme: "light" }, signal),
  ]);
  expect(
    outcomes.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const failed = outcomes.find(
    (result) => result.status === "rejected",
  ) as PromiseRejectedResult;
  expect(failed.reason.code).toBe("revision_conflict");
  const records = await listRecovery(remote.connection.owner.userId, signal);
  expect(records).toHaveLength(1);
  expect(records[0].operation?.expectedRevision).toBe(1);
  expect(records[0].latest).not.toBeNull();
});

test("a committed journal write with failed verification can recover without a false stale-owner error", async () => {
  const remote = server();
  const signal = new AbortController().signal;
  const source = new AccountWorkspaceDataSource(remote.connection);
  await source.load(signal);
  const open = IDBFactory.prototype.open;
  let calls = 0;
  const broken = vi
    .spyOn(IDBFactory.prototype, "open")
    .mockImplementation(function (this: IDBFactory, name, version) {
      if (++calls === 2) throw new Error("Verification read failed");
      return open.call(this, name, version);
    });
  await source.stage({ ...emptyWorkspace(), theme: "dark" }, signal);
  expect(source.immediateSaving).toBe(true);
  broken.mockRestore();
  await source.save({ ...emptyWorkspace(), theme: "dark" }, signal);
  expect(remote.bodies).toHaveLength(1);
  expect(source.immediateSaving).toBe(false);
  expect(await listRecovery(remote.connection.owner.userId, signal)).toEqual(
    [],
  );
});
