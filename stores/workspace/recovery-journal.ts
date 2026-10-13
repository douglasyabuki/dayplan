import type { Workspace } from "@/types-and-constants/workspace";

import { CoordinationError } from "./coordination";
import { validateWorkspace } from "./validation";

export type SaveOperation = {
  operationId: string;
  snapshot: Workspace;
  expectedRevision: number;
};

export type RecoveryRecord = {
  version: 1;
  userId: string;
  writerId: string;
  sequence: number;
  generation: number;
  baseRevision: number;
  latest: Workspace | null;
  operation: (SaveOperation & { generation: number }) | null;
};

export class RecoveryStorageError extends Error {
  readonly code = "recovery_storage_error";
  constructor() {
    super(
      "Browser recovery could not be saved. Changes are being saved immediately to your account. Keep this page open until saving is confirmed, or download a backup.",
    );
  }
}

export class RecoveryValidationError extends Error {
  readonly code = "recovery_invalid";
  constructor() {
    super(
      "Stored account recovery is invalid. It has been kept; retry recovery or download a backup before discarding it.",
    );
  }
}

/** Reject corrupt recovery rather than overwriting it. */
function validate(record: RecoveryRecord): RecoveryRecord {
  if (
    !record ||
    !Object.hasOwn(record, "latest") ||
    !Object.hasOwn(record, "operation")
  )
    throw new RecoveryValidationError();
  if (
    record.version !== 1 ||
    typeof record.userId !== "string" ||
    typeof record.writerId !== "string" ||
    ![record.sequence, record.generation, record.baseRevision].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    )
  )
    throw new RecoveryValidationError();
  try {
    if (record.latest) validateWorkspace(structuredClone(record.latest));
  } catch {
    throw new RecoveryValidationError();
  }
  if (record.operation) {
    if (
      !Number.isSafeInteger(record.operation.expectedRevision) ||
      record.operation.expectedRevision < 0 ||
      !Number.isSafeInteger(record.operation.generation) ||
      record.operation.generation < 0 ||
      record.operation.generation > record.generation ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        record.operation.operationId,
      )
    )
      throw new RecoveryValidationError();
    try {
      validateWorkspace(structuredClone(record.operation.snapshot));
    } catch {
      throw new RecoveryValidationError();
    }
  }
  return record;
}

/** A connection per transaction avoids retaining a blocked database upgrade. */
async function database(signal: AbortSignal): Promise<IDBDatabase> {
  signal.throwIfAborted();
  if (typeof indexedDB === "undefined") throw new RecoveryStorageError();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("dayplan-account-recovery", 1);
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    request.onupgradeneeded = () =>
      request.result.createObjectStore("journals", {
        keyPath: ["userId", "writerId"],
      });
    request.onerror = request.onblocked = () => {
      signal.removeEventListener("abort", abort);
      reject(new RecoveryStorageError());
    };
    request.onsuccess = () => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) {
        request.result.close();
        reject(signal.reason);
      } else resolve(request.result);
    };
  });
}

/** Runs an abortable atomic journal transaction. */
async function transaction<T>(
  signal: AbortSignal,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const db = await database(signal);
  try {
    return await new Promise<T>((resolve, reject) => {
      signal.throwIfAborted();
      const tx = db.transaction("journals", mode, {
        durability: mode === "readwrite" ? "strict" : "default",
      });
      let result: T;
      let failure: unknown;
      const abort = () => {
        try {
          tx.abort();
        } catch {
          /* Already completed. */
        }
      };
      signal.addEventListener("abort", abort, { once: true });
      tx.oncomplete = () => {
        signal.removeEventListener("abort", abort);
        resolve(result);
      };
      tx.onabort = tx.onerror = () => {
        signal.removeEventListener("abort", abort);
        reject(
          signal.aborted
            ? signal.reason
            : (failure ?? new RecoveryStorageError()),
        );
      };
      try {
        work(tx.objectStore("journals"), (value) => {
          result = value;
        });
      } catch (error) {
        failure = error;
        tx.abort();
      }
    });
  } finally {
    db.close();
  }
}

export function readRecovery(
  userId: string,
  writerId: string,
  signal: AbortSignal,
): Promise<RecoveryRecord | null> {
  return transaction(signal, "readonly", (store, done) => {
    const request = store.get([userId, writerId]);
    request.onsuccess = () => done(request.result ?? null);
  }).then((value) => (value ? validate(value as RecoveryRecord) : null));
}

export function listRecovery(
  userId: string,
  signal: AbortSignal,
): Promise<RecoveryRecord[]> {
  return transaction<RecoveryRecord[]>(signal, "readonly", (store, done) => {
    const request = store.getAll(
      IDBKeyRange.bound([userId, ""], [userId, "\uffff"]),
    );
    request.onsuccess = () => done(request.result);
  }).then((rows) =>
    rows.map(validate).filter((row) => row.latest || row.operation),
  );
}

/** Compare-and-swap ensures an older writer cannot erase newer durable state. */
export async function writeRecovery(
  record: RecoveryRecord,
  expectedSequence: number,
  signal: AbortSignal,
  onCommitted?: () => void,
): Promise<void> {
  validate(record);
  let stale = false;
  try {
    await transaction<void>(signal, "readwrite", (store, done) => {
      const request = store.get([record.userId, record.writerId]);
      request.onsuccess = () => {
        if ((request.result?.sequence ?? 0) !== expectedSequence) {
          stale = true;
          store.transaction.abort();
          return;
        }
        store.put(record);
        done(undefined);
      };
    });
  } catch (error) {
    if (stale) throw new CoordinationError();
    throw error;
  }
  onCommitted?.();
  const stored = await readRecovery(record.userId, record.writerId, signal);
  if (JSON.stringify(stored) !== JSON.stringify(record))
    throw new RecoveryStorageError();
}
