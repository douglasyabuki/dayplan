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
import { type TaskOperation } from "@/lib/tasks/operations";
import { emptyWorkspace } from "@/lib/workspace/empty";
import { seedWorkspace } from "@/lib/workspace/seed";
import {
  AccountWorkspaceDataSource,
  type ImportPreview,
  PersistenceError,
} from "@/stores/workspace/account-data-source";
import { type Action } from "@/stores/workspace/actions";
import { taskAction, taskOperationAction } from "@/stores/workspace/commands";
import type { WorkspaceDataSource } from "@/stores/workspace/data-source";
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
  notice: { message: string } | null;
  confirmation: Confirmation | null;
  undo: () => void;
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
  retrySave: () => void;
  reloadSaved: () => void;
  downloadBackup: () => void;
  previewGuestImport: (snapshot: Workspace) => Promise<ImportPreview>;
  importGuest: (snapshot: Workspace, token: string) => Promise<boolean>;
  retryImport: () => Promise<boolean>;
  hasPendingImport: boolean;
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
  const [operationError, setOperationError] = useState("");
  const persistence = useRef<WorkspacePersistenceSession | null>(null);
  const revision = useRef(0);
  function commit(next: Workspace) {
    if (!persistence.current?.active) return;
    revision.current += 1;
    current.current = next;
    dispatch({ type: "replace", state: next });
  }
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [busy, setBusy] = useState(false);
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
  const freshWorkspace = () =>
    database
      ? emptyWorkspace(Intl.DateTimeFormat().resolvedOptions().timeZone)
      : seedWorkspace();
  function storageFailure(message: string, cause?: unknown) {
    setError(cause instanceof Error ? cause.message : message);
    setRecoveryCode(
      cause instanceof PersistenceError ? cause.code : "storage_error",
    );
  }
  const [notice, setNotice] = useState<{
    message: string;
    before: Workspace;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [today, setToday] = useState("");

  useEffect(() => {
    const scope = new WorkspacePersistenceSession(dataSource, storageFailure);
    persistence.current = scope;
    scope.load(
      (restored) => {
        commit(restored ?? freshWorkspace());
        setReady(true);
      },
      (cause) => {
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
    return () => scope.close();
    // The keyed owner boundary fixes the data source for this provider lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource]);
  useEffect(() => {
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
      actionProps: {
        children: "Undo",
        onClick: () => {
          if (!persistence.current?.active || editsBlocked()) return;
          commit(notice.before);
          setOperationError("");
          setNotice(null);
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
  }, [notice, editsBlocked]);
  function act(action: Action, message?: string) {
    if (!persistence.current?.active || !ready || editsBlocked()) return false;
    try {
      const before = current.current;
      const next = reducer(before, taskAction(before, action));
      setOperationError("");
      if (next === before) return true;
      if (message) setNotice({ message, before });
      commit(next);
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
      title: clear ? "Clear your workspace data?" : "Reset your workspace?",
      confirmLabel: clear ? "Clear data" : undefined,
      description: clear
        ? `This permanently removes all tasks, projects, tags, and related workspace data ${database ? "from your account" : "from this browser"}. Your profile, theme, and timezone are kept. This cannot be undone.`
        : database
          ? "This replaces the saved account workspace with an empty workspace."
          : "This replaces your tasks, projects, and tags with fresh sample data in this browser.",
      action: () => {
        const scope = persistence.current;
        if (!scope?.active || editsBlocked() || (database && !!error)) return;
        const fresh = clear
          ? {
              ...emptyWorkspace(current.current.timezone),
              theme: current.current.theme,
            }
          : freshWorkspace();
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
            commit(fresh);
            setNotice(null);
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
      commit(snapshot ?? freshWorkspace());
      setNotice(null);
      setOperationError("");
      setError("");
      setRecoveryCode("");
      return true;
    } catch (cause) {
      if (scope.active) {
        if (
          cause instanceof PersistenceError &&
          cause.code === "import_confirmation_required"
        ) {
          scope.resume();
          setOperationError(
            "Import history changed. Open Account settings and choose Import guest data to review and confirm it again.",
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
        persistenceKind: database ? "database" : "browser",
        recoveryCode,
        busy,
        retrySave,
        reloadSaved,
        downloadBackup,
        previewGuestImport,
        hasPendingImport:
          dataSource instanceof AccountWorkspaceDataSource &&
          dataSource.hasPendingImport,
        importGuest: (snapshot, token) =>
          exclusive(async (source, signal) => {
            await source.save(current.current, signal);
            return source.importGuest(snapshot, token, signal);
          }),
        retryImport: () =>
          exclusive((source, signal) => source.retryImport(signal), true),
        notice,
        confirmation,
        undo: () => {
          if (!notice || !persistence.current?.active || editsBlocked()) return;
          commit(notice.before);
          setOperationError("");
          setNotice(null);
        },
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
          if (persistence.current?.active) setConfirmation(value);
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
