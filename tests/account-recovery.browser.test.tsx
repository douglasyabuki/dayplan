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
import {
  listRecovery,
  readRecovery,
  type RecoveryRecord,
  writeRecovery,
} from "@/stores/workspace/recovery-journal";
import type { Workspace } from "@/types-and-constants/workspace";

afterEach(() => vi.restoreAllMocks());

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
