"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";

import { toast } from "@/components/ui/toast";
import { dateKey } from "@/lib/dates";
import { type TaskOperation } from "@/lib/tasks/operations";
import { seedWorkspace } from "@/lib/workspace/seed";
import { type Action } from "@/stores/workspace/actions";
import { taskAction, taskOperationAction } from "@/stores/workspace/commands";
import type { WorkspaceDataSource } from "@/stores/workspace/data-source";
import { WorkspacePersistenceSession } from "@/stores/workspace/persistence-session";
import { reducer } from "@/stores/workspace/reducer";
import type { Occurrence } from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";

type Confirmation = {
  title: string;
  description: string;
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
  const [notice, setNotice] = useState<{
    message: string;
    before: Workspace;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [today, setToday] = useState("");

  useEffect(() => {
    const scope = new WorkspacePersistenceSession(dataSource, setError);
    persistence.current = scope;
    scope.load(
      (restored) => {
        commit(restored ?? seedWorkspace());
        setReady(true);
      },
      (cause) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "Storage is unavailable. Changes will stay in this session.",
        );
        commit(seedWorkspace());
        setReady(true);
      },
    );
    return () => scope.close();
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
          if (!persistence.current?.active) return;
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
  }, [notice]);
  function act(action: Action, message?: string) {
    if (!persistence.current?.active || !ready) return false;
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
  function reset() {
    if (!persistence.current?.active || !ready) return;
    setConfirmation({
      title: "Reset your workspace?",
      description:
        "This replaces your tasks, projects, and tags with fresh sample data in this browser.",
      action: () => {
        const scope = persistence.current;
        if (!scope?.active) return;
        const fresh = seedWorkspace();
        const before = revision.current;
        scope.reset(fresh, () => {
          setError("");
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
        notice,
        confirmation,
        undo: () => {
          if (!notice || !persistence.current?.active) return;
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
        reset,
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
