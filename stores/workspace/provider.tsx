"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";

import { toast } from "@/components/ui/toast";
import { dateKey } from "@/lib/dates";
import type { DraftEntries } from "@/lib/tasks/editor";
import { type TaskOperation } from "@/lib/tasks/operations";
import { emptyWorkspace } from "@/lib/workspace/empty";
import { seedWorkspace } from "@/lib/workspace/seed";
import { GUEST_DATA_EVENT } from "@/stores/persistence/guest-events";
import {
  readDeletion,
  subscribeDeletion,
} from "@/stores/session/deletion-state";
import { registerDeparture } from "@/stores/session/departure";
import {
  AccountWorkspaceDataSource,
  type ImportPreview,
  PersistenceError,
} from "@/stores/workspace/account-data-source";
import { type Action } from "@/stores/workspace/actions";
import {
  commitDrafts,
  taskAction,
  taskOperationAction,
} from "@/stores/workspace/commands";
import type { WorkspaceDataSource } from "@/stores/workspace/data-source";
import {
  assertDraftsCurrent,
  contentKey,
  type DraftExpectation,
} from "@/stores/workspace/draft-guard";
import { type GuestData, readGuestData } from "@/stores/workspace/guest-data";
import { workspaceContent, WorkspaceHistory } from "@/stores/workspace/history";
import { WorkspacePersistenceSession } from "@/stores/workspace/persistence-session";
import { reducer } from "@/stores/workspace/reducer";
import { validateWorkspace } from "@/stores/workspace/validation";
import type { Occurrence } from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";

type Confirmation = {
  title: string;
  description: string;
  confirmLabel?: string;
  action: (choice?: string) => void;
  choice?: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
  };
};
type Context = {
  state: Workspace;
  today: string;
  storageError: boolean;
  ready: boolean;
  error: string;
  recoveryStorageError: string;
  notice: { message: string } | null;
  confirmation: Confirmation | null;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
  dismissNotice: () => void;
  cancelConfirmation: () => void;
  setConfirmationChoice: (value: string) => void;
  acceptConfirmation: () => void;
  act: (action: Action, message?: string) => boolean;
  operationError: string;
  dismissOperationError: () => void;
  operate: (operation: TaskOperation, message?: string) => void;
  save: (task: Occurrence, message?: string) => void;
  toggle: (task: Occurrence) => void;
  confirm: (value: Confirmation) => void;
  reset: () => void;
  clearData: () => void;
  persistenceKind: "browser" | "database";
  recoveryCode: string;
  busy: boolean;
  deletionPaused: boolean;
  syncStatus: "Saved" | "Pending" | "Saving" | "Offline" | "Needs attention";
  syncAvailable: boolean;
  syncNow: () => Promise<boolean>;
  holdRemoteRefresh: () => () => void;
  adoptionEpoch: number;
  readEditorState: () => Workspace;
  commitEditorDrafts: (
    entries: DraftEntries,
    expectations: DraftExpectation[],
    message: string,
  ) => boolean;
  operateEditor: (
    operation: TaskOperation,
    expectations: DraftExpectation[],
    message: string,
  ) => boolean;
  retrySave: () => void;
  retryRecovery: () => void;
  reloadSaved: () => void;
  downloadBackup: () => void;
  restoreBackup: (snapshot: unknown) => void;
  previewGuestImport: (snapshot: Workspace) => Promise<ImportPreview>;
  importGuest: (snapshot: Workspace, token: string) => Promise<boolean>;
  retryImport: () => Promise<boolean>;
  hasPendingImport: boolean;
  guestData: GuestData | null;
  guestDataError: string;
  guestCleanupError: string;
  hasPendingGuestCleanup: boolean;
  retryGuestCleanup: () => void;
  discardGuest: (target: GuestData) => boolean;
};
const TaskContext = createContext<Context | null>(null);
const initial: Workspace = {
  version: 2,
  sections: [],
  layouts: {},
  timezone: "UTC",
  tasks: [],
  projects: [],
  tags: [],
  exceptions: {},
  theme: "system",
};

export function WorkspaceProvider({
  children,
  dataSource,
}: {
  children: ReactNode;
  dataSource: WorkspaceDataSource;
}) {
  const [state, dispatch] = useReducer(reducer, initial);
  const current = useRef(initial);
  const history = useRef(new WorkspaceHistory());
  const [historyGeneration, setHistoryGeneration] = useState(0);
  const [operationError, setOperationError] = useState("");
  const persistence = useRef<WorkspacePersistenceSession | null>(null);
  const revision = useRef(0);
  const epoch = useRef(0);
  const [adoptionEpoch, setAdoptionEpoch] = useState(0);
  const [activity, setActivity] = useState({ pending: false, saving: false });
  const [online, setOnline] = useState(true);
  const remoteFlight = useRef(false);
  const [remoteRefreshing, setRemoteRefreshing] = useState(false);
  const lastRemoteCheck = useRef(Date.now());
  const refreshHolds = useRef(0);
  const refreshGeneration = useRef(0);
  const [remoteOffline, setRemoteOffline] = useState(false);
  const holdRemoteRefresh = useCallback(() => {
    refreshHolds.current += 1;
    refreshGeneration.current += 1;
    return () => {
      refreshHolds.current -= 1;
      refreshGeneration.current += 1;
    };
  }, []);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const skipFailureSnapshot = useRef(false);
  const commit = useCallback(
    (next: Workspace, persistEdit = false) => {
      if (!persistence.current?.active) return;
      revision.current += 1;
      current.current = next;
      dispatch({ type: "replace", state: next });
      if (persistEdit && dataSource.stage)
        persistence.current?.saveLatest(next);
    },
    [dataSource],
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [recoveryStorageError, setRecoveryStorageError] = useState(() =>
    dataSource instanceof AccountWorkspaceDataSource
      ? dataSource.recoveryStorageError
      : "",
  );
  const [recoveryCode, setRecoveryCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletionPaused, setDeletionPaused] = useState(false);
  const [lifetime, setLifetime] = useState(0);
  const busyRef = useRef(false);
  const editsBlocked = useCallback(() => {
    if (busyRef.current) return true;
    if (
      dataSource instanceof AccountWorkspaceDataSource &&
      dataSource.hasPendingImport
    ) {
      setOperationError(
        "Resolve the pending import before editing your workspace.",
      );
      return true;
    }
    return false;
  }, [dataSource]);
  const database = dataSource.owner.kind === "account";
  const [guestAvailability, setGuestAvailability] = useState<{
    data: GuestData | null;
    error: string;
  }>({ data: null, error: "" });
  useEffect(() => {
    if (!database) return;
    const refresh = () => {
      try {
        setGuestAvailability({ data: readGuestData(), error: "" });
      } catch {
        setGuestAvailability({
          data: null,
          error:
            "Guest data could not be read. It has not been changed; import is unavailable.",
        });
      }
    };
    refresh();
    window.addEventListener(GUEST_DATA_EVENT, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(GUEST_DATA_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [database]);
  const freshWorkspace = () =>
    database
      ? emptyWorkspace(Intl.DateTimeFormat().resolvedOptions().timeZone)
      : seedWorkspace();
  function storageFailure(message: string, cause?: unknown) {
    setError(cause instanceof Error ? cause.message : message);
    setRecoveryCode(
      cause && typeof cause === "object" && "code" in cause
        ? String(cause.code)
        : "storage_error",
    );
  }
  const [notice, setNotice] = useState<{
    message: string;
    entryId?: number;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [today, setToday] = useState("");

  const clearHistory = useCallback(() => {
    history.current.clear();
    setHistoryGeneration(history.current.generation);
    setNotice(null);
  }, []);
  const travel = useCallback(
    (direction: "undo" | "redo", generation: number, entryId?: number) => {
      if (
        !persistence.current?.active ||
        !ready ||
        editsBlocked() ||
        generation !== history.current.generation ||
        (entryId !== undefined && entryId !== history.current.undoId)
      )
        return false;
      const next = history.current[direction](current.current);
      if (!next) return false;
      commit(next, true);
      setOperationError("");
      setNotice(null);
      return true;
    },
    [ready, editsBlocked, commit],
  );
  const undo = useCallback(
    () => travel("undo", historyGeneration),
    [travel, historyGeneration],
  );
  const redo = useCallback(
    () => travel("redo", historyGeneration),
    [travel, historyGeneration],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "z" ||
        confirmation
      )
        return;
      const typing = event
        .composedPath()
        .some(
          (target) =>
            target instanceof HTMLElement &&
            (target.isContentEditable ||
              target.matches(
                'input,textarea,select,[role="textbox"],[role="combobox"]',
              )),
        );
      if (typing) return;
      if ((event.shiftKey ? redo : undo)()) event.preventDefault();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, confirmation]);

  useEffect(() => {
    let loaded = false;
    const scope = new WorkspacePersistenceSession(
      dataSource,
      storageFailure,
      () => {
        if (scope.active) setActivity(scope.status);
      },
    );
    persistence.current = scope;
    const account =
      dataSource instanceof AccountWorkspaceDataSource ? dataSource : null;
    const unsubscribeRecovery = account?.subscribeRecovery(() => {
      if (scope.active) setRecoveryStorageError(account.recoveryStorageError);
    });
    const updateDeletion = () => {
      if (dataSource.owner.kind !== "account") return;
      const paused = !!readDeletion(dataSource.owner.userId);
      if (paused) {
        scope.close();
        busyRef.current = true;
        setBusy(true);
        setDeletionPaused(true);
      } else if (!scope.active) {
        busyRef.current = false;
        setBusy(false);
        setDeletionPaused(false);
        setLifetime((value) => value + 1);
      }
    };
    const unsubscribeDeletion = subscribeDeletion(updateDeletion);
    updateDeletion();
    const unregister =
      account && dataSource.owner.kind === "account"
        ? registerDeparture(dataSource.owner.userId, {
            prepare: async (deadline) => {
              busyRef.current = true;
              setBusy(true);
              if (loaded) scope.saveLatest(current.current);
              try {
                await scope.flush(deadline - 2000);
              } catch {
                /* Coverage decides departure. */
              }
              return account.recoveryCovered(
                new AbortController().signal,
                deadline,
              );
            },
            resume: () => {
              if (scope.active) {
                busyRef.current = false;
                setBusy(false);
                scope.resume();
              }
            },
            discard: async () => {
              busyRef.current = true;
              setBusy(true);
              await account.discardRecovery(new AbortController().signal);
            },
          })
        : null;
    scope.load(
      (restored) => {
        loaded = true;
        clearHistory();
        commit(restored ?? freshWorkspace());
        setReady(true);
      },
      (cause) => {
        loaded = true;
        clearHistory();
        skipFailureSnapshot.current = true;
        storageFailure(
          cause instanceof Error
            ? cause.message
            : "Storage is unavailable. Changes will stay in this session.",
          cause,
        );
        setRecoveryCode("load_failed");
        commit(
          dataSource instanceof AccountWorkspaceDataSource
            ? (dataSource.recoverySnapshot ?? freshWorkspace())
            : freshWorkspace(),
        );
        setReady(true);
      },
    );
    return () => {
      unregister?.();
      scope.close();
      unsubscribeRecovery?.();
      unsubscribeDeletion();
    };
    // The keyed owner boundary fixes the data source for this provider lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource, lifetime]);
  useEffect(() => {
    if (skipFailureSnapshot.current) {
      skipFailureSnapshot.current = false;
      return;
    }
    if (ready) persistence.current?.saveLatest(state);
  }, [state, ready]);
  useEffect(() => {
    const update = () => setToday(dateKey(new Date(), state.timezone));
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [state.timezone]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle(
        "dark",
        state.theme === "dark" || (state.theme === "system" && media.matches),
      );
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [state.theme]);
  useEffect(() => {
    if (!notice) return;
    const id = toast.add({
      title: notice.message,
      type: "success",
      timeout: 4000,
      actionProps:
        notice.entryId === undefined
          ? undefined
          : {
              children: "Undo",
              onClick: () => {
                if (travel("undo", historyGeneration, notice.entryId))
                  toast.close(id);
              },
            },
      onClose: () => {
        if (!persistence.current?.active) return;
        setNotice((currentNotice) =>
          currentNotice === notice ? null : currentNotice,
        );
      },
    });
    return () => toast.close(id);
  }, [notice, travel, historyGeneration]);
  function act(action: Action, message?: string) {
    if (!persistence.current?.active || !ready || editsBlocked()) return false;
    try {
      const before = current.current;
      const next = reducer(before, taskAction(before, action));
      setOperationError("");
      if (next === before) return true;
      const entryId = history.current.record(before, next);
      if (entryId !== undefined)
        setNotice(message ? { message, entryId } : null);
      else if (message && contentKey(before) !== contentKey(next))
        setNotice({ message });
      commit(next, true);
      return true;
    } catch (cause) {
      setOperationError(
        cause instanceof Error ? cause.message : "Unable to apply this change.",
      );
      return false;
    }
  }
  function operate(operation: TaskOperation, message?: string) {
    if (!persistence.current?.active) return;
    act(taskOperationAction(current.current, operation), message);
  }
  function save(task: Occurrence, message?: string) {
    act({ type: "occurrence", task }, message);
  }
  function toggle(task: Occurrence) {
    operate(
      {
        kind: "complete",
        task,
        completed: !task.completed,
        today,
      },
      task.completed ? "Task reopened" : "Task completed",
    );
  }
  function requestReset(clear: boolean) {
    if (
      !persistence.current?.active ||
      !ready ||
      editsBlocked() ||
      (database && !!error)
    )
      return;
    setConfirmation({
      title: clear ? "Clear your workspace data?" : "Reset to sample data?",
      confirmLabel: clear ? "Clear data" : "Reset to sample data",
      description: clear
        ? `This permanently removes all tasks, projects, tags, and related workspace data ${database ? "from your account" : "from this browser"}. Your profile, theme, and timezone are kept. This cannot be undone.`
        : `This replaces all tasks, projects, tags, and related workspace data ${database ? "in your account" : "in this browser"} with fresh sample data. Your profile, theme, and timezone are kept. This cannot be undone.`,
      action: () => {
        const scope = persistence.current;
        if (!scope?.active || editsBlocked() || (database && !!error)) return;
        const fresh = {
          ...(clear
            ? emptyWorkspace(current.current.timezone)
            : seedWorkspace(current.current.timezone)),
          theme: current.current.theme,
          timezone: current.current.timezone,
        };
        const before = revision.current;
        scope.reset(fresh, () => {
          setError("");
          setRecoveryCode("");
          if (revision.current !== before) {
            scope.saveLatest(current.current);
            setOperationError(
              "Your workspace changed while resetting. Your edits were kept; try reset again.",
            );
          } else {
            adoptRemote(fresh, true);
          }
        });
      },
    });
  }

  function restoreBackup(value: unknown) {
    if (!persistence.current?.active || !ready || editsBlocked() || error)
      return;
    let snapshot: Workspace;
    try {
      snapshot = validateWorkspace(value);
    } catch {
      setOperationError(
        "Choose a valid Dayplan JSON backup. Your workspace has not been changed.",
      );
      return;
    }
    setConfirmation({
      title: "Restore backup?",
      confirmLabel: "Restore backup",
      description: `This replaces your entire workspace ${database ? "in your account" : "in this browser"}, including tasks, projects, tags, theme, and timezone, with the backup. Your profile is kept. Download a backup of your current workspace first if you want to keep it. This cannot be undone.`,
      action: () => {
        const scope = persistence.current;
        if (!scope?.active || editsBlocked() || error) return;
        busyRef.current = true;
        setBusy(true);
        void scope
          .exclusive(async (signal) => {
            await dataSource.save(snapshot, signal);
          })
          .then(() => {
            if (!scope.active) return;
            adoptRemote(snapshot, true);
            setOperationError("");
            toast.add({ title: "Backup restored", type: "success" });
          })
          .catch((cause: unknown) => {
            if (scope.active)
              storageFailure(
                "The backup could not be saved. Your current workspace has been kept.",
                cause,
              );
          })
          .finally(() => {
            if (scope.active) {
              busyRef.current = false;
              setBusy(false);
            }
          });
      },
    });
  }

  function downloadBackup() {
    try {
      const snapshot = validateWorkspace(current.current);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(snapshot, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `dayplan-workspace-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setOperationError(
        "Your local backup could not be downloaded. Your edits are still available.",
      );
    }
  }

  async function exclusive(
    operation: (
      source: AccountWorkspaceDataSource,
      signal: AbortSignal,
    ) => Promise<Workspace | null>,
    allowPaused = false,
  ): Promise<boolean> {
    const scope = persistence.current;
    if (
      !scope?.active ||
      busyRef.current ||
      !(dataSource instanceof AccountWorkspaceDataSource)
    )
      return false;
    busyRef.current = true;
    setBusy(true);
    try {
      const snapshot = await scope.exclusive(
        (signal) => operation(dataSource, signal),
        allowPaused,
      );
      if (!scope.active) return false;
      adoptRemote(snapshot ?? freshWorkspace(), true);
      setOperationError("");
      setError("");
      setRecoveryCode("");
      return true;
    } catch (cause) {
      if (scope.active) {
        if (
          (cause instanceof PersistenceError &&
            cause.code === "import_confirmation_required") ||
          (cause instanceof PersistenceError &&
            [
              "guest_changed",
              "guest_metadata_failed",
              "guest_cleanup_pending",
              "guest_recovery_pending",
            ].includes(cause.code))
        ) {
          scope.resume();
          setOperationError(
            cause.code === "import_confirmation_required"
              ? "Import history changed. Open Settings and choose Data to review and confirm the guest import again."
              : cause.message,
          );
        } else storageFailure("Account storage is unavailable.", cause);
      }
      return false;
    } finally {
      if (scope.active) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function adoptRemote(snapshot: Workspace, replacement = false) {
    if (!replacement && contentKey(snapshot) === contentKey(current.current))
      return;
    epoch.current += 1;
    setAdoptionEpoch(epoch.current);
    if (
      replacement ||
      contentKey(workspaceContent(snapshot)) !==
        contentKey(workspaceContent(current.current))
    )
      clearHistory();
    setConfirmation(null);
    commit(snapshot);
  }

  const blockingSync =
    !!recoveryStorageError ||
    (dataSource instanceof AccountWorkspaceDataSource &&
      dataSource.hasPendingImport) ||
    (!!error && recoveryCode !== "network_error");
  const syncStatus: Context["syncStatus"] =
    deletionPaused || blockingSync
      ? "Needs attention"
      : !online || remoteOffline || recoveryCode === "network_error"
        ? "Offline"
        : busy || activity.saving
          ? "Saving"
          : activity.pending
            ? "Pending"
            : "Saved";
  const syncAvailable =
    ready && database && online && !busy && !remoteRefreshing && !blockingSync;

  useEffect(() => {
    if (!(dataSource instanceof AccountWorkspaceDataSource)) return;
    const scope = persistence.current;
    const safe = () =>
      !!scope?.active &&
      scope === persistence.current &&
      scope.writable &&
      ready &&
      !error &&
      !recoveryStorageError &&
      !busyRef.current &&
      !confirmation &&
      !refreshHolds.current &&
      !history.current.canUndo &&
      !history.current.canRedo &&
      !scope.status.pending &&
      !scope.status.saving &&
      !dataSource.hasPendingImport &&
      dataSource.isSaved(current.current) &&
      navigator.onLine &&
      document.visibilityState === "visible";
    let canceled = false;
    const refresh = async () => {
      if (
        remoteFlight.current ||
        Date.now() - lastRemoteCheck.current < 30000 ||
        !safe()
      )
        return;
      remoteFlight.current = true;
      setRemoteRefreshing(true);
      const before = revision.current;
      const generation = refreshGeneration.current;
      const canAdopt = () =>
        !canceled &&
        safe() &&
        revision.current === before &&
        refreshGeneration.current === generation;
      try {
        await scope!.inspect(
          (signal) =>
            dataSource.refresh(signal, canAdopt, (snapshot) => {
              adoptRemote(snapshot ?? freshWorkspace());
              setRemoteOffline(false);
            }),
          Date.now() + 10000,
        );
      } catch (cause) {
        if (canceled || !scope?.active) return;
        const code =
          cause && typeof cause === "object" && "code" in cause
            ? cause.code
            : undefined;
        if (code === "sync_pending") return;
        if (code === "network_error") setRemoteOffline(true);
        else
          storageFailure(
            "Remote refresh needs attention. Your local work has been kept.",
            cause,
          );
      } finally {
        lastRemoteCheck.current = Date.now();
        remoteFlight.current = false;
        if (scope?.active) setRemoteRefreshing(false);
      }
    };
    const check = () => {
      void refresh();
    };
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      canceled = true;
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
    };
    // Adoption is guarded by this effect's lifetime and synchronous edit counters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource, ready, error, recoveryStorageError, confirmation]);

  async function syncNow(): Promise<boolean> {
    const scope = persistence.current;
    if (
      !scope?.active ||
      remoteFlight.current ||
      busyRef.current ||
      !ready ||
      !navigator.onLine ||
      blockingSync ||
      !(dataSource instanceof AccountWorkspaceDataSource)
    )
      return false;
    busyRef.current = true;
    setBusy(true);
    const deadline = Date.now() + 30000;
    try {
      scope.saveLatest(current.current);
      await scope.flush(deadline);
      const snapshot = await scope.inspect(
        (signal) => dataSource.refresh(signal),
        deadline,
      );
      if (!scope.active) return false;
      adoptRemote(snapshot ?? freshWorkspace());
      setError("");
      setRecoveryCode("");
      setOperationError("");
      setRemoteOffline(false);
      scope.resume();
      return true;
    } catch (cause) {
      if (scope.active)
        storageFailure(
          "Sync could not be completed. Your edits have been kept.",
          cause,
        );
      return false;
    } finally {
      lastRemoteCheck.current = Date.now();
      if (scope.active) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function guardedEditor(
    expectations: DraftExpectation[],
    action: () => boolean,
  ): boolean {
    if (!persistence.current?.active || editsBlocked()) return false;
    try {
      assertDraftsCurrent(current.current, expectations);
      return action();
    } catch (cause) {
      setOperationError(
        cause instanceof Error
          ? cause.message
          : "Review the task changes first.",
      );
      return false;
    }
  }

  function reloadSaved() {
    setConfirmation({
      title: "Load the saved workspace?",
      description:
        "This discards unsaved local edits. Download a local backup first if you want to keep them.",
      action: () => {
        void exclusive((source, signal) => source.reload(signal), true);
      },
    });
  }

  function retrySave() {
    if (busyRef.current) return;
    persistence.current?.retry(current.current, () => {
      setError("");
      setRecoveryCode("");
      persistence.current?.saveLatest(current.current);
    });
  }

  async function previewGuestImport(
    snapshot: Workspace,
  ): Promise<ImportPreview> {
    if (
      !(dataSource instanceof AccountWorkspaceDataSource) ||
      !persistence.current?.active ||
      busyRef.current
    )
      throw new Error("Account access is required.");
    const scope = persistence.current;
    return scope.inspect((signal) =>
      dataSource.previewImport(snapshot, signal),
    );
  }
  return (
    <TaskContext.Provider
      value={{
        state,
        operationError,
        dismissOperationError: () => {
          if (persistence.current?.active) setOperationError("");
        },
        today,
        storageError: !!error,
        ready: ready && !!today,
        error,
        recoveryStorageError,
        persistenceKind: database ? "database" : "browser",
        recoveryCode,
        busy,
        deletionPaused,
        adoptionEpoch,
        readEditorState: () => structuredClone(current.current),
        syncStatus,
        syncAvailable,
        syncNow,
        holdRemoteRefresh,
        commitEditorDrafts: (entries, expectations, message) =>
          guardedEditor(expectations, () => {
            if (
              Object.keys(entries).length !== expectations.length ||
              expectations.some(
                ({ entry }) =>
                  contentKey(entries[entry.original.id]) !== contentKey(entry),
              )
            )
              throw new Error("Review all draft entries before saving.");
            return act(
              {
                type: "replace",
                state: commitDrafts(current.current, entries),
              },
              message,
            );
          }),
        operateEditor: (operation, expectations, message) =>
          guardedEditor(expectations, () =>
            act(taskOperationAction(current.current, operation), message),
          ),
        retrySave,
        retryRecovery: () => {
          void exclusive((source, signal) => source.load(signal), true);
        },
        reloadSaved,
        downloadBackup,
        restoreBackup,
        previewGuestImport,
        hasPendingImport:
          dataSource instanceof AccountWorkspaceDataSource &&
          dataSource.hasPendingImport,
        guestData: guestAvailability.data,
        guestDataError: guestAvailability.error,
        guestCleanupError:
          dataSource instanceof AccountWorkspaceDataSource
            ? dataSource.guestCleanupError
            : "",
        hasPendingGuestCleanup:
          dataSource instanceof AccountWorkspaceDataSource &&
          dataSource.hasPendingGuestCleanup,
        retryGuestCleanup: () => {
          if (
            persistence.current?.active &&
            dataSource instanceof AccountWorkspaceDataSource
          )
            dataSource.retryGuestCleanup();
        },
        discardGuest: (target) => {
          if (
            !persistence.current?.active ||
            busyRef.current ||
            !(dataSource instanceof AccountWorkspaceDataSource) ||
            dataSource.hasPendingImport
          )
            return false;
          try {
            return dataSource.discardGuest(target);
          } catch (cause) {
            setOperationError(
              cause instanceof Error
                ? cause.message
                : "Guest data could not be deleted. Try discarding again.",
            );
            return false;
          }
        },
        importGuest: (snapshot, token) => {
          // Capture profile values at confirmation, before queued account saves.
          let target: GuestData;
          try {
            target = readGuestData();
          } catch {
            setOperationError(
              "Guest data could not be read. Import has not started.",
            );
            return Promise.resolve(false);
          }
          return exclusive(async (source, signal) => {
            await source.save(current.current, signal);
            return source.importGuest(snapshot, token, signal, target);
          });
        },
        retryImport: () =>
          exclusive((source, signal) => source.retryImport(signal), true),
        notice,
        confirmation,
        undo,
        redo,
        canUndo:
          ready &&
          !busy &&
          history.current.canUndo &&
          !(
            dataSource instanceof AccountWorkspaceDataSource &&
            dataSource.hasPendingImport
          ),
        canRedo:
          ready &&
          !busy &&
          history.current.canRedo &&
          !(
            dataSource instanceof AccountWorkspaceDataSource &&
            dataSource.hasPendingImport
          ),
        dismissNotice: () => {
          if (persistence.current?.active) setNotice(null);
        },
        cancelConfirmation: () => {
          if (persistence.current?.active) setConfirmation(null);
        },
        setConfirmationChoice: (value) =>
          persistence.current?.active &&
          setConfirmation((current) =>
            current?.choice
              ? { ...current, choice: { ...current.choice, value } }
              : current,
          ),
        acceptConfirmation: () => {
          if (!persistence.current?.active) return;
          confirmation?.action(confirmation.choice?.value);
          setConfirmation(null);
        },
        act,
        operate,
        save,
        toggle,
        confirm: (value) => {
          const capturedEpoch = epoch.current;
          if (persistence.current?.active)
            setConfirmation({
              ...value,
              action: (choice) => {
                if (capturedEpoch === epoch.current) value.action(choice);
              },
            });
        },
        reset: () => requestReset(false),
        clearData: () => requestReset(true),
      }}
    >
      {children}
    </TaskContext.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(TaskContext);
  if (!context) throw new Error("WorkspaceProvider is required");
  return context;
}

export function useOptionalWorkspace() {
  return useContext(TaskContext);
}
