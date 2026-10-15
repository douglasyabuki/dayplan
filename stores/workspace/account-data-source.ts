import type { AccountProfile } from "@/stores/account/model";
import type { ProfileDataSource } from "@/stores/account/persistence";
import { notifyGuestDataChanged } from "@/stores/persistence/guest-events";
import type { WorkspaceOwner } from "@/stores/session/model";
import type { WorkspaceDataSource } from "@/stores/workspace/data-source";
import { validateWorkspace } from "@/stores/workspace/validation";
import type { Workspace } from "@/types-and-constants/workspace";

import {
  accountCoordinated,
  bounded,
  CoordinationError,
  journalCoordinated,
} from "./coordination";
import {
  cleanupGuestData,
  type GuestCleanupJournal,
  guestCleanupKey,
  type GuestData,
  readGuestCleanup,
  readGuestData,
  sameGuestData,
  sameGuestWorkspace,
  writeGuestCleanup,
} from "./guest-data";
import {
  listRecovery,
  readRecovery,
  type RecoveryRecord,
  RecoveryStorageError,
  RecoveryValidationError,
  type SaveOperation,
  writeRecovery,
} from "./recovery-journal";

export class PersistenceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type ImportPreview = {
  historyToken: string;
  hasPriorImports: boolean;
  alreadyImported: boolean;
};
type ImportOperation = {
  snapshot: Workspace;
  expectedRevision: number;
  confirmedHistoryToken: string;
};

class AccountConnection {
  constructor(
    readonly owner: WorkspaceOwner,
    public sessionId: string,
  ) {}

  async request<T>(
    path: string,
    signal: AbortSignal,
    body?: unknown,
    method = "POST",
  ): Promise<T> {
    return bounded(signal, Date.now() + 10000, (inner) =>
      this.send<T>(path, inner, body, method),
    );
  }

  private async send<T>(
    path: string,
    signal: AbortSignal,
    body?: unknown,
    method = "POST",
  ): Promise<T> {
    signal.throwIfAborted();
    const sessionId = this.sessionId;
    let response: Response;
    try {
      response = await fetch(path, {
        method: body === undefined ? "GET" : method,
        credentials: "same-origin",
        cache: "no-store",
        signal,
        headers: {
          "X-Dayplan-Session": sessionId,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new PersistenceError(
        "network_error",
        "The save outcome is unknown. Retry to check safely; your local edits have been kept.",
      );
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new PersistenceError(
        "network_error",
        "The response was lost. Retry to check the operation safely.",
      );
    }
    if (!response.ok) {
      signal.throwIfAborted();
      if (
        result.code === "unauthorized" ||
        result.code === "session_mismatch"
      ) {
        window.dispatchEvent(
          new CustomEvent("dayplan-session-invalid", { detail: { sessionId } }),
        );
      }
      throw new PersistenceError(
        result.code ?? "storage_error",
        result.message ?? "Account storage is unavailable.",
      );
    }
    signal.throwIfAborted();
    return result as T;
  }
}

export class AccountWorkspaceDataSource implements WorkspaceDataSource {
  readonly owner: WorkspaceOwner;
  private revision = 0;
  private saved = "";
  private pendingSave: SaveOperation | null = null;
  private writerId = crypto.randomUUID();
  private generation = 0;
  private operationGeneration = 0;
  private latest: Workspace | null = null;
  private sequence = 0;
  private durableRecord: RecoveryRecord | null = null;
  private journalQueue: Promise<void> = Promise.resolve();
  private stagingQueue: Promise<void> = Promise.resolve();
  recoveryStorageError = "";
  private recoveryListeners = new Set<() => void>();

  subscribeRecovery(listener: () => void): () => void {
    this.recoveryListeners.add(listener);
    return () => {
      this.recoveryListeners.delete(listener);
    };
  }

  private notifyRecovery() {
    for (const listener of this.recoveryListeners) listener();
  }
  private pendingImport: ImportOperation | null = null;
  private cleanupJournal: GuestCleanupJournal | null = null;
  guestCleanupError = "";

  constructor(
    private connection: Pick<
      AccountConnection,
      "owner" | "request" | "sessionId"
    >,
  ) {
    this.owner = connection.owner;
  }

  get hasPendingImport() {
    return this.pendingImport !== null;
  }

  get hasPendingGuestCleanup() {
    return this.cleanupJournal?.confirmed === true;
  }

  retryGuestCleanup() {
    if (!this.cleanupJournal?.confirmed) return;
    const result = cleanupGuestData(this.cleanupJournal.target);
    this.guestCleanupError = result.error;
    if (!result.error) {
      try {
        const key = guestCleanupKey(this.accountId);
        const stored = readGuestCleanup(this.accountId);
        if (
          stored &&
          sameGuestData(stored.target, this.cleanupJournal.target)
        ) {
          localStorage.removeItem(key);
          if (localStorage.getItem(key) !== null)
            throw new Error("Cleanup receipt was not removed.");
        }
        this.cleanupJournal = null;
      } catch {
        this.guestCleanupError =
          "Guest data cleanup could not be completed. Retry cleanup; the confirmed import will not be repeated.";
      }
    }
    notifyGuestDataChanged();
  }

  private get accountId() {
    if (this.owner.kind !== "account")
      throw new Error("Account access is required.");
    return this.owner.userId;
  }

  discardGuest(target: GuestData) {
    if (this.pendingImport)
      throw new Error(
        "Resolve the pending import before discarding guest data.",
      );
    if (!sameGuestData(readGuestData(), target)) {
      throw new Error(
        "Guest data changed. Review it and confirm discarding again.",
      );
    }
    const previous = readGuestCleanup(this.accountId);
    if (previous?.operation && !previous.confirmed) {
      throw new Error(
        "Resolve the saved guest import before discarding guest data. Reopen the app to recover it safely.",
      );
    }
    const journal = { target, confirmed: true };
    // Retain the confirmed discard decision through partial deletion and reload.
    writeGuestCleanup(this.accountId, journal);
    this.cleanupJournal = journal;
    this.retryGuestCleanup();
    return !this.guestCleanupError;
  }

  private finishGuestCleanup(journal: GuestCleanupJournal) {
    this.cleanupJournal = { ...journal, confirmed: true };
    // A lost journal write must not turn a confirmed account import into a failure.
    // The server receipt still proves completion when reopening the app.
    try {
      writeGuestCleanup(this.accountId, this.cleanupJournal);
    } catch {
      // Keep the captured targets in memory and attempt conditional deletion.
    }
    this.retryGuestCleanup();
  }

  private async recoverGuestCleanup(
    signal: AbortSignal,
  ): Promise<Workspace | undefined> {
    let journal: GuestCleanupJournal | null;
    try {
      journal = readGuestCleanup(this.accountId);
    } catch {
      this.guestCleanupError =
        "Guest cleanup information could not be read. Guest data has been kept.";
      return;
    }
    if (journal?.confirmed) {
      this.cleanupJournal = journal;
      this.retryGuestCleanup();
      return;
    }
    if (journal?.operation) {
      this.pendingImport = journal.operation;
      this.cleanupJournal = journal;
    }
    try {
      const guest = journal?.target.snapshot ?? readGuestData().snapshot;
      if (!guest) return;
      const preview = await this.previewImport(guest, signal);
      signal.throwIfAborted();
      if (preview.alreadyImported) {
        // The receipt may have appeared after the first account read.
        const recovered = await this.reload(signal);
        if (!recovered)
          throw new Error(
            "The imported account workspace is unavailable. Guest data has been kept.",
          );
        this.pendingImport = null;
        this.finishGuestCleanup(
          journal ?? {
            target: { snapshot: guest, profiles: {} },
            confirmed: true,
          },
        );
        return recovered;
      } else if (this.pendingImport) {
        throw new PersistenceError(
          "import_pending",
          "A guest import outcome is unresolved. Retry import to check safely; guest data has been kept.",
        );
      }
    } catch (cause) {
      if (signal.aborted || this.pendingImport) throw cause;
      this.guestCleanupError =
        "Guest import history could not be checked. Guest data has been kept; try reviewing the import again.";
    }
  }

  get recoverySnapshot(): Workspace | null {
    return this.latest
      ? structuredClone(this.latest)
      : this.pendingSave
        ? structuredClone(this.pendingSave.snapshot)
        : this.saved
          ? validateWorkspace(JSON.parse(this.saved))
          : null;
  }

  get immediateSaving() {
    return !!this.recoveryStorageError;
  }

  isSaved(snapshot: Workspace): boolean {
    return (
      !this.latest &&
      !this.pendingSave &&
      JSON.stringify(snapshot) === this.saved
    );
  }

  async discardRecovery(signal: AbortSignal): Promise<void> {
    await bounded(signal, Date.now() + 4000, (inner) =>
      accountCoordinated(this.accountId, inner, Date.now() + 4000, async () => {
        const before = { latest: this.latest, pending: this.pendingSave };
        this.latest = null;
        this.pendingSave = null;
        try {
          await this.persist(inner);
        } catch (error) {
          this.latest = before.latest;
          this.pendingSave = before.pending;
          throw error;
        }
        if (
          this.recoveryStorageError &&
          (this.durableRecord?.latest || this.durableRecord?.operation)
        ) {
          this.latest = before.latest;
          this.pendingSave = before.pending;
          throw new RecoveryStorageError();
        }
      }),
    );
  }

  private record(): RecoveryRecord {
    return {
      version: 1,
      userId: this.accountId,
      writerId: this.writerId,
      sequence: this.sequence + 1,
      generation: this.generation,
      baseRevision: this.revision,
      latest: this.latest ? structuredClone(this.latest) : null,
      operation: this.pendingSave
        ? {
            ...structuredClone(this.pendingSave),
            generation: this.operationGeneration,
          }
        : null,
    };
  }

  private storageFailure() {
    this.recoveryStorageError = new RecoveryStorageError().message;
    this.notifyRecovery();
  }

  private persist(signal: AbortSignal): Promise<void> {
    const update = this.journalQueue.then(() => {
      signal.throwIfAborted();
      return journalCoordinated(
        this.accountId,
        this.writerId,
        signal,
        Date.now() + 2000,
        () => this.persistNow(signal),
      );
    });
    this.journalQueue = update.catch(() => {});
    return update;
  }

  private async persistNow(signal: AbortSignal) {
    const record = this.record();
    // Construct cancellation under the journal lock from current state, never
    // from the snapshot captured when staging was queued. Keep latest until
    // the tombstone has been verified, including when storage fails.
    const cancelLatest =
      !!this.latest &&
      !this.pendingSave &&
      JSON.stringify(this.latest) === this.saved;
    if (cancelLatest) record.latest = null;
    try {
      await bounded(signal, Date.now() + 1500, (inner) =>
        writeRecovery(record, this.sequence, inner, () => {
          this.sequence = record.sequence;
          this.durableRecord = record;
        }),
      );
      this.sequence = record.sequence;
      if (
        cancelLatest &&
        this.generation === record.generation &&
        !this.pendingSave &&
        JSON.stringify(this.latest) === this.saved
      )
        this.latest = null;
      this.recoveryStorageError = "";
      this.notifyRecovery();
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof CoordinationError) throw error;
      this.storageFailure();
    }
  }

  /** Stage edits immediately, independently of the network debounce. */
  stage(snapshot: Workspace, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const unchanged =
      JSON.stringify(snapshot) === JSON.stringify(this.latest) ||
      (!this.latest && JSON.stringify(snapshot) === this.saved);
    if (unchanged && !this.recoveryStorageError) return this.stagingQueue;
    if (!unchanged) {
      this.latest = structuredClone(snapshot);
      this.generation += 1;
    }
    // Cleanup cancels requests, not an accepted edit's durable write.
    const stageSignal = new AbortController().signal;
    const run = () =>
      bounded(stageSignal, Date.now() + 4000, (inner) => this.persist(inner));
    const staged = this.stagingQueue.then(run);
    this.stagingQueue = staged.catch(() => {});
    return staged;
  }

  /** Verify actual contents, including newer edits and the immutable unresolved payload. */
  async recoveryCovered(
    signal: AbortSignal,
    deadline: number,
  ): Promise<boolean> {
    if (this.pendingImport) {
      try {
        const journal = readGuestCleanup(this.accountId);
        if (
          JSON.stringify(journal?.operation) !==
          JSON.stringify(this.pendingImport)
        )
          return false;
      } catch {
        return false;
      }
    }
    if (!this.latest && !this.pendingSave) return true;
    try {
      return await bounded(signal, deadline, async (inner) => {
        // A read-only atomic observation does not bypass lock ownership.
        // It remains available when another tab holds the account network lock.
        const stored = await readRecovery(this.accountId, this.writerId, inner);
        const expected = this.record();
        return (
          !!stored &&
          stored.generation === this.generation &&
          stored.baseRevision === this.revision &&
          JSON.stringify(stored.latest) === JSON.stringify(expected.latest) &&
          JSON.stringify(stored.operation) ===
            JSON.stringify(expected.operation)
        );
      });
    } catch {
      return false;
    }
  }

  private async finishSave(signal: AbortSignal): Promise<void> {
    if (!this.pendingSave) return;
    const operation = this.pendingSave;
    const operationGeneration = this.operationGeneration;
    const result = await this.connection.request<{
      committedRevision: number;
      currentRevision: number;
    }>("/api/workspace", signal, operation, "PUT");
    signal.throwIfAborted();
    if (
      !result ||
      typeof result !== "object" ||
      !Number.isSafeInteger(result.committedRevision) ||
      result.committedRevision !== operation.expectedRevision + 1 ||
      !Number.isSafeInteger(result.currentRevision) ||
      result.currentRevision < result.committedRevision
    )
      throw new PersistenceError(
        "network_error",
        "The save response could not be verified. Retry safely.",
      );
    this.pendingSave = null;
    this.revision = result.committedRevision;
    this.saved = JSON.stringify(operation.snapshot);
    if (this.generation === operationGeneration) this.latest = null;
    await this.persist(signal);
    if (result.currentRevision !== result.committedRevision)
      throw new PersistenceError(
        "revision_conflict",
        "Your save completed, but another device saved newer changes. Download your local backup before reloading.",
      );
  }

  async load(signal: AbortSignal): Promise<Workspace | null> {
    return bounded(signal, Date.now() + 10000, async (inner) => {
      await this.stagingQueue;
      inner.throwIfAborted();
      return this.loadRecovery(inner);
    });
  }

  private async loadRecovery(signal: AbortSignal): Promise<Workspace | null> {
    let records: RecoveryRecord[] = [];
    try {
      records = await listRecovery(this.accountId, signal);
    } catch (error) {
      if (signal.aborted || error instanceof RecoveryValidationError)
        throw error;
      this.storageFailure();
    }
    if (this.pendingSave || this.latest) {
      let own: RecoveryRecord | null = null;
      try {
        own = await readRecovery(this.accountId, this.writerId, signal);
      } catch (error) {
        if (signal.aborted || error instanceof RecoveryValidationError)
          throw error;
        this.storageFailure();
      }
      if (own)
        records = [
          own,
          ...records.filter((record) => record.writerId !== own.writerId),
        ];
      else
        await accountCoordinated(
          this.accountId,
          signal,
          Date.now() + 10000,
          () => this.saveLocked(signal),
        );
    }
    for (const candidate of records) {
      await accountCoordinated(
        this.accountId,
        signal,
        Date.now() + 10000,
        async () => {
          const record = await readRecovery(
            this.accountId,
            candidate.writerId,
            signal,
          );
          if (!record) return;
          const sameWriter = this.writerId === record.writerId;
          if (
            !record.latest &&
            !record.operation &&
            !(sameWriter && (this.latest || this.pendingSave))
          )
            return;
          const memoryLatest = sameWriter ? this.latest : null;
          const memoryRevision = this.revision;
          const memoryGeneration = sameWriter ? this.generation : 0;
          const memoryOperation = sameWriter ? this.pendingSave : null;
          const memoryOperationGeneration = this.operationGeneration;
          if (
            sameWriter &&
            memoryLatest &&
            memoryGeneration < record.generation
          )
            throw new CoordinationError();
          if (
            memoryOperation &&
            record.operation &&
            memoryOperation.operationId !== record.operation.operationId
          )
            throw new CoordinationError();
          this.writerId = record.writerId;
          this.sequence = record.sequence;
          this.durableRecord = record;
          this.generation = record.generation;
          this.revision = record.baseRevision;
          this.latest = record.latest;
          this.operationGeneration = record.operation?.generation ?? 0;
          this.pendingSave = record.operation
            ? {
                operationId: record.operation.operationId,
                snapshot: record.operation.snapshot,
                expectedRevision: record.operation.expectedRevision,
              }
            : null;
          if (memoryGeneration >= record.generation && memoryLatest) {
            this.latest = memoryLatest;
            this.generation = memoryGeneration;
            this.revision = memoryRevision;
          }
          if (memoryOperation && !this.pendingSave) {
            this.pendingSave = memoryOperation;
            this.operationGeneration = memoryOperationGeneration;
          }
          await this.saveLocked(signal);
        },
      );
    }
    if (records.length) {
      // Recovered writers keep tombstones; new edits belong to this new writer.
      this.writerId = crypto.randomUUID();
      this.sequence = 0;
      this.durableRecord = null;
      this.generation = 0;
    }
    // Reconcile an ambiguous operation before a returning owner's initial load.
    if (this.pendingImport) return this.retryImport(signal);
    const snapshot = await this.reload(signal);
    const recovered = await this.recoverGuestCleanup(signal);
    return recovered ?? snapshot;
  }

  /** Refresh only confirmed data; unlike reload this never discards unresolved edits. */
  async refresh(
    signal: AbortSignal,
    canAdopt?: () => boolean,
    onAdopt?: (snapshot: Workspace | null) => void,
  ): Promise<Workspace | null> {
    await this.stagingQueue;
    return accountCoordinated(
      this.accountId,
      signal,
      Date.now() + 10000,
      async () => {
        const generation = this.generation;
        const assertSafe = async () => {
          // Background reads must not bypass another tab's durable recovery.
          if (canAdopt) {
            const records = await listRecovery(this.accountId, signal);
            signal.throwIfAborted();
            const guest = readGuestCleanup(this.accountId);
            if (
              records.some((record) => record.latest || record.operation) ||
              (guest?.operation && !guest.confirmed) ||
              !canAdopt() ||
              generation !== this.generation
            )
              throw new PersistenceError(
                "sync_pending",
                "Local work has been kept. Use Sync now when ready.",
              );
          }
        };
        await assertSafe();
        if (this.pendingSave || this.pendingImport || this.latest)
          throw new PersistenceError(
            "sync_pending",
            "Confirm local edits before retrieving remote changes.",
          );
        const result = await this.connection.request<{
          snapshot: Workspace | null;
          revision: number;
        }>("/api/workspace", signal);
        signal.throwIfAborted();
        if (
          !Number.isSafeInteger(result.revision) ||
          result.revision < this.revision ||
          (result.snapshot === null && result.revision !== 0)
        )
          throw new PersistenceError(
            "invalid_remote",
            "The remote workspace revision could not be verified.",
          );
        const snapshot =
          result.snapshot === null ? null : validateWorkspace(result.snapshot);
        await assertSafe();
        signal.throwIfAborted();
        if (
          this.pendingSave ||
          this.pendingImport ||
          this.latest ||
          (canAdopt && (!canAdopt() || generation !== this.generation))
        )
          throw new PersistenceError(
            "sync_pending",
            "Local edits changed during sync. They have been kept.",
          );
        this.revision = result.revision;
        this.saved = snapshot ? JSON.stringify(snapshot) : "";
        // Publish inside the same synchronous boundary as the confirmed baseline.
        // A later provider continuation could race an edit against that baseline.
        onAdopt?.(snapshot);
        return snapshot;
      },
    );
  }

  async reload(signal: AbortSignal): Promise<Workspace | null> {
    if (this.pendingSave) {
      try {
        await bounded(signal, Date.now() + 10000, (inner) =>
          accountCoordinated(this.accountId, inner, Date.now() + 10000, () =>
            this.finishSave(inner),
          ),
        );
      } catch (error) {
        if (
          !(error instanceof PersistenceError) ||
          !["revision_conflict", "operation_mismatch"].includes(error.code)
        )
          throw error;
      }
    }
    const result = await this.connection.request<{
      snapshot: Workspace | null;
      revision: number;
    }>("/api/workspace", signal);
    signal.throwIfAborted();
    if (!Number.isSafeInteger(result.revision) || result.revision < 0)
      throw new PersistenceError(
        "network_error",
        "The workspace revision could not be verified.",
      );
    const snapshot =
      result.snapshot === null ? null : validateWorkspace(result.snapshot);
    this.pendingSave = null;
    this.revision = result.revision;
    this.saved = snapshot ? JSON.stringify(snapshot) : "";
    this.latest = null;
    await bounded(signal, Date.now() + 4000, (inner) =>
      accountCoordinated(this.accountId, inner, Date.now() + 4000, () =>
        this.persist(inner),
      ),
    );
    return snapshot;
  }

  async save(snapshot: Workspace, signal: AbortSignal): Promise<void> {
    if (this.pendingImport)
      throw new PersistenceError(
        "import_pending",
        "Resolve the pending import before saving.",
      );
    await this.stage(snapshot, signal);
    await this.stagingQueue;
    await bounded(signal, Date.now() + 10000, (inner) =>
      accountCoordinated(this.accountId, inner, Date.now() + 10000, () =>
        this.saveLocked(inner),
      ),
    );
  }

  private async saveLocked(signal: AbortSignal): Promise<void> {
    await this.finishSave(signal);
    const snapshot = this.latest;
    if (
      !snapshot ||
      (JSON.stringify(snapshot) === this.saved && !this.recoveryStorageError)
    ) {
      this.latest = null;
      return;
    }
    this.pendingSave = {
      operationId: crypto.randomUUID(),
      snapshot: structuredClone(snapshot),
      expectedRevision: this.revision,
    };
    this.operationGeneration = this.generation;
    await this.persist(signal);
    await this.finishSave(signal);
  }

  previewImport(
    snapshot: Workspace,
    signal: AbortSignal,
  ): Promise<ImportPreview> {
    return this.connection.request("/api/workspace/import/preview", signal, {
      snapshot,
    });
  }

  async importGuest(
    snapshot: Workspace,
    confirmedHistoryToken: string,
    signal: AbortSignal,
    target: GuestData = readGuestData(),
  ): Promise<Workspace> {
    if (this.pendingSave)
      await bounded(signal, Date.now() + 10000, (inner) =>
        accountCoordinated(this.accountId, inner, Date.now() + 10000, () =>
          this.finishSave(inner),
        ),
      );
    if (!this.pendingImport) {
      if (this.cleanupJournal?.confirmed) {
        throw new PersistenceError(
          "guest_cleanup_pending",
          "Retry guest cleanup before starting another import.",
        );
      }
      try {
        const previous = readGuestCleanup(this.accountId);
        if (previous?.operation || previous?.confirmed) {
          throw new Error("Saved guest recovery must be resolved first.");
        }
      } catch {
        throw new PersistenceError(
          "guest_recovery_pending",
          "Guest recovery information needs attention. Reopen the app before importing; guest data has been kept.",
        );
      }
      if (!target.snapshot || !sameGuestWorkspace(target.snapshot, snapshot)) {
        throw new PersistenceError(
          "guest_changed",
          "Guest data changed. Review and confirm the import again.",
        );
      }
      this.pendingImport = {
        snapshot: structuredClone(snapshot),
        expectedRevision: this.revision,
        confirmedHistoryToken,
      };
      const journal: GuestCleanupJournal = {
        target,
        operation: this.pendingImport,
        confirmed: false,
      };
      try {
        writeGuestCleanup(this.accountId, journal);
      } catch {
        this.pendingImport = null;
        throw new PersistenceError(
          "guest_metadata_failed",
          "Guest import recovery information could not be saved. Guest data has been kept; import has not started.",
        );
      }
      this.cleanupJournal = journal;
    }
    return this.retryImport(signal);
  }

  async retryImport(signal: AbortSignal): Promise<Workspace> {
    return bounded(signal, Date.now() + 10000, (inner) =>
      accountCoordinated(this.accountId, inner, Date.now() + 10000, () =>
        this.retryImportLocked(inner),
      ),
    );
  }

  private async retryImportLocked(signal: AbortSignal): Promise<Workspace> {
    if (!this.pendingImport)
      throw new PersistenceError(
        "invalid_input",
        "There is no pending import.",
      );
    let result: { snapshot: Workspace; revision: number };
    try {
      result = await this.connection.request(
        "/api/workspace/import",
        signal,
        this.pendingImport,
      );
    } catch (error) {
      if (
        error instanceof PersistenceError &&
        [
          "import_confirmation_required",
          "revision_conflict",
          "invalid_input",
        ].includes(error.code)
      ) {
        this.pendingImport = null;
        if (this.cleanupJournal) {
          this.cleanupJournal = {
            ...this.cleanupJournal,
            operation: undefined,
          };
          try {
            writeGuestCleanup(this.accountId, this.cleanupJournal);
          } catch {
            /* Preserve recovery targets. */
          }
        }
      }
      throw error;
    }
    const snapshot = validateWorkspace(result.snapshot);
    if (!Number.isSafeInteger(result.revision) || result.revision < 0) {
      throw new PersistenceError(
        "network_error",
        "The import response could not be verified. Retry import safely; guest data has been kept.",
      );
    }
    const imported = this.pendingImport.snapshot;
    this.revision = result.revision;
    this.saved = JSON.stringify(snapshot);
    this.latest = null;
    await this.persist(signal);
    this.pendingImport = null;
    this.finishGuestCleanup(
      this.cleanupJournal ?? {
        target: { snapshot: imported, profiles: {} },
        confirmed: true,
      },
    );
    return snapshot;
  }
}

const accounts = new Map<
  string,
  {
    connection: AccountConnection;
    workspace: AccountWorkspaceDataSource;
    profile: ProfileDataSource;
  }
>();

export function accountDataSources(
  userId: string,
  sessionId: string,
): { workspace: AccountWorkspaceDataSource; profile: ProfileDataSource } {
  let sources = accounts.get(userId);
  if (!sources) {
    const connection = new AccountConnection(
      { kind: "account", userId },
      sessionId,
    );
    sources = {
      connection,
      workspace: new AccountWorkspaceDataSource(connection),
      profile: {
        owner: connection.owner,
        load: (signal) =>
          connection.request<AccountProfile>("/api/profile", signal),
        save: async (profile, signal) => {
          await connection.request(
            "/api/profile",
            signal,
            { name: profile.name },
            "PATCH",
          );
        },
      },
    };
    accounts.set(userId, sources);
  }
  sources.connection.sessionId = sessionId;
  return sources;
}
