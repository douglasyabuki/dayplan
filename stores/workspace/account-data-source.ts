import type { AccountProfile } from "@/stores/account/model";
import type { ProfileDataSource } from "@/stores/account/persistence";
import type { WorkspaceOwner } from "@/stores/session/model";
import type { WorkspaceDataSource } from "@/stores/workspace/data-source";
import { validateWorkspace } from "@/stores/workspace/validation";
import type { Workspace } from "@/types-and-constants/workspace";

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

  constructor(private connection: AccountConnection) {
    this.owner = connection.owner;
  }

  get hasPendingImport() {
    return this.pendingImport !== null;
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
    return this.reload(signal);
  }

  async reload(signal: AbortSignal): Promise<Workspace | null> {
    const result = await this.connection.request<{
      snapshot: Workspace | null;
      revision: number;
    }>("/api/workspace", signal);
    const snapshot =
      result.snapshot === null ? null : validateWorkspace(result.snapshot);
    this.pendingSave = null;
    this.pendingImport = null;
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
  ): Promise<Workspace> {
    if (this.pendingSave) await this.finishSave(signal);
    if (!this.pendingImport)
      this.pendingImport = {
        snapshot: structuredClone(snapshot),
        expectedRevision: this.revision,
        confirmedHistoryToken,
      };
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
      )
        this.pendingImport = null;
      throw error;
    }
    const snapshot = validateWorkspace(result.snapshot);
    this.revision = result.revision;
    this.saved = JSON.stringify(snapshot);
    this.pendingImport = null;
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
