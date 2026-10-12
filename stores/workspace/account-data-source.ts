import type { AccountProfile } from "@/stores/account/model";
import type { ProfileDataSource } from "@/stores/account/persistence";
import { notifyGuestDataChanged } from "@/stores/persistence/guest-events";
import type { WorkspaceOwner } from "@/stores/session/model";
import type { WorkspaceDataSource } from "@/stores/workspace/data-source";
import { validateWorkspace } from "@/stores/workspace/validation";
import type { Workspace } from "@/types-and-constants/workspace";

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
type SaveOperation = {
  operationId: string;
  snapshot: Workspace;
  expectedRevision: number;
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
  private pendingImport: ImportOperation | null = null;
  private cleanupJournal: GuestCleanupJournal | null = null;
  guestCleanupError = "";

  constructor(private connection: AccountConnection) {
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
    return this.pendingSave
      ? structuredClone(this.pendingSave.snapshot)
      : this.saved
        ? validateWorkspace(JSON.parse(this.saved))
        : null;
  }

  private async finishSave(signal: AbortSignal): Promise<void> {
    if (!this.pendingSave) return;
    const operation = this.pendingSave;
    const result = await this.connection.request<{
      committedRevision: number;
      currentRevision: number;
    }>("/api/workspace", signal, operation, "PUT");
    this.pendingSave = null;
    this.revision = result.committedRevision;
    this.saved = JSON.stringify(operation.snapshot);
    if (result.currentRevision !== result.committedRevision)
      throw new PersistenceError(
        "revision_conflict",
        "Your save completed, but another device saved newer changes. Download your local backup before reloading.",
      );
  }

  async load(signal: AbortSignal): Promise<Workspace | null> {
    // Reconcile an ambiguous operation before a returning owner's initial load.
    if (this.pendingImport) return this.retryImport(signal);
    if (this.pendingSave) {
      try {
        await this.finishSave(signal);
      } catch (error) {
        if (
          !(error instanceof PersistenceError) ||
          error.code !== "revision_conflict"
        )
          throw error;
        this.pendingSave = null;
      }
    }
    const snapshot = await this.reload(signal);
    const recovered = await this.recoverGuestCleanup(signal);
    return recovered ?? snapshot;
  }

  async reload(signal: AbortSignal): Promise<Workspace | null> {
    const result = await this.connection.request<{
      snapshot: Workspace | null;
      revision: number;
    }>("/api/workspace", signal);
    const snapshot =
      result.snapshot === null ? null : validateWorkspace(result.snapshot);
    this.pendingSave = null;
    this.revision = result.revision;
    this.saved = snapshot ? JSON.stringify(snapshot) : "";
    return snapshot;
  }

  async save(snapshot: Workspace, signal: AbortSignal): Promise<void> {
    if (this.pendingImport)
      throw new PersistenceError(
        "import_pending",
        "Resolve the pending import before saving.",
      );
    await this.finishSave(signal);
    if (JSON.stringify(snapshot) === this.saved) return;
    this.pendingSave = {
      operationId: crypto.randomUUID(),
      snapshot: structuredClone(snapshot),
      expectedRevision: this.revision,
    };
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
    if (this.pendingSave) await this.finishSave(signal);
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
