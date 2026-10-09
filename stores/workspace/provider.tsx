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

import { dateKey } from "@/lib/dates";
import { type TaskOperation } from "@/lib/tasks/operations";
import { seedWorkspace } from "@/lib/workspace/seed";
import { type Action } from "@/stores/workspace/actions";
import { taskAction, taskOperationAction } from "@/stores/workspace/commands";
import { readWorkspace, writeWorkspace } from "@/stores/workspace/persistence";
import { reducer } from "@/stores/workspace/reducer";
import type { Occurrence } from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";

type Confirmation = { title: string; description: string; action: () => void };
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

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const current = useRef(initial);
  const [operationError, setOperationError] = useState("");
  function commit(next: Workspace) {
    current.current = next;
    dispatch({ type: "replace", state: next });
  }
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const writable = useRef(false);
  const [notice, setNotice] = useState<{
    message: string;
    before: Workspace;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [today, setToday] = useState("");

  useEffect(() => {
    try {
      const restored = readWorkspace() ?? seedWorkspace();
      commit(restored);
      writable.current = true;
    } catch (cause) {
      // Browser storage is an external system; surface its hydration failure before enabling writes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(
        cause instanceof Error
          ? cause.message
          : "Storage is unavailable. Changes will stay in this session.",
      );
      commit(seedWorkspace());
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || !writable.current) return;
    // Report a failed external storage write while retaining the in-memory workspace.

    try {
      writeWorkspace(state);
    } catch {
      writable.current = false;
      // This effect reports a failure from the external storage write above.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(
        "Your browser could not save changes. Your current work is still available in this session.",
      );
    }
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
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 7000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  function act(action: Action, message?: string) {
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
    act(taskOperationAction(state, operation), message);
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
    setConfirmation({
      title: "Reset your workspace?",
      description:
        "This replaces your tasks, projects, and tags with fresh sample data in this browser.",
      action: () => {
        const fresh = seedWorkspace();
        try {
          writeWorkspace(fresh);
          writable.current = true;
          setError("");
          commit(fresh);
          setNotice(null);
        } catch {
          setError("Storage is still unavailable. Reset was not saved.");
        }
      },
    });
  }
  return (
    <TaskContext.Provider
      value={{
        state,
        operationError,
        dismissOperationError: () => setOperationError(""),
        today,
        storageError: !!error,
        ready: ready && !!today,
        error,
        notice,
        confirmation,
        undo: () => {
          if (!notice) return;
          commit(notice.before);
          setOperationError("");
          setNotice(null);
        },
        dismissNotice: () => setNotice(null),
        cancelConfirmation: () => setConfirmation(null),
        acceptConfirmation: () => {
          confirmation?.action();
          setConfirmation(null);
        },
        act,
        operate,
        save,
        toggle,
        confirm: setConfirmation,
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
