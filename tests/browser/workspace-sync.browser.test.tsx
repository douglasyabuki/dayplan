import { useEffect, useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import { DraftReview } from "@/components/tasks/editor/draft-review";
import { useEditorSession } from "@/components/tasks/editor/use-task-editor";
import { WorkspaceSyncControl } from "@/components/workspace/workspace-sync-control";
import { useWorkspaceTaskEditor } from "@/hooks/workspace/use-workspace-task-editor";
import type { DraftEntries } from "@/lib/tasks/editor";
import { asOccurrence } from "@/lib/tasks/recurrence";
import {
  AccountWorkspaceDataSource,
  PersistenceError,
} from "@/stores/workspace/account-data-source";
import { draftKey } from "@/stores/workspace/draft-guard";
import { useWorkspace, WorkspaceProvider } from "@/stores/workspace/provider";
import { get, state, task } from "@/tests/task-fixtures";
import type { Workspace } from "@/types-and-constants/workspace";

vi.mock("@/contexts/workspace-controller", () => ({
  useWorkspaceController: () => ({
    editorGuardRef: { current: null },
    onTaskCreated: () => {},
  }),
}));

function SelectedEditor() {
  const workspace = useWorkspace();
  const editor = useWorkspaceTaskEditor({
    state: workspace.state,
    today: workspace.today,
    act: workspace.act,
    view: "inbox",
    selectedId: undefined,
    params: new URLSearchParams({ task: JSON.stringify(["a"]) }),
    setParams: () => {},
    router: {
      bfcacheId: "test",
      back: () => {},
      forward: () => {},
      refresh: () => {},
      push: () => {},
      replace: () => {},
      prefetch: async () => {},
    },
    allTasks: workspace.state.tasks.map(asOccurrence),
    closeTaskActions: () => {},
  });
  return workspace.ready && editor.selectedTask ? (
    <ReadyDraftHarness key={editor.selectedTask.id} initial={workspace.state} />
  ) : null;
}

test("selected editor session stays mounted with its draft after remote task deletion", async () => {
  const remote = server();
  const screen = await render(
    <WorkspaceProvider dataSource={remote.source}>
      <Harness />
      <SelectedEditor />
    </WorkspaceProvider>,
  );
  await screen.getByRole("button", { name: "Draft title" }).click();
  remote.edit(state([task("b")]));
  await screen.getByRole("button", { name: "Run sync" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Discard affected draft" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Save draft" }))
    .toBeDisabled();
  expect(document.body.textContent).toContain("My draft");
});

test("identical refresh retains Undo; later local actions undo against adopted data", async () => {
  const remote = server();
  const screen = await render(
    <WorkspaceProvider dataSource={remote.source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await screen.getByRole("button", { name: "Edit workspace" }).click();
  await screen.getByRole("button", { name: "Run sync" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Workspace sync: Saved" }))
    .toBeVisible();
  expect(exposed.adoptionEpoch).toBe(0);
  expect(exposed.notice).not.toBeNull();
  remote.edit({ ...exposed.state, theme: "light" });
  await screen.getByRole("button", { name: "Run sync" }).click();
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("light");
  expect(exposed.notice).toBeNull();
  await screen.getByRole("button", { name: "Edit workspace" }).click();
  await screen.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("light");
});

test("offline disables sync and conflicts require attention", async () => {
  const remote = server();
  const screen = await render(
    <WorkspaceProvider dataSource={remote.source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await expect
    .element(screen.getByRole("button", { name: "Workspace sync: Saved" }))
    .toBeVisible();
  const connectivity = vi
    .spyOn(navigator, "onLine", "get")
    .mockReturnValue(false);
  window.dispatchEvent(new Event("offline"));
  await expect
    .element(screen.getByRole("button", { name: "Workspace sync: Offline" }))
    .toBeVisible();
  await screen.getByRole("button", { name: "Workspace sync: Offline" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Sync now", exact: true }))
    .toBeDisabled();
  connectivity.mockReturnValue(true);
  window.dispatchEvent(new Event("online"));
  await expect
    .element(screen.getByRole("button", { name: "Sync now", exact: true }))
    .toBeEnabled();
  remote.edit({ ...exposed.state, theme: "light" });
  await screen.getByRole("button", { name: "Edit workspace" }).click();
  await screen.getByRole("button", { name: "Run sync" }).click();
  await expect
    .element(
      screen.getByRole("button", { name: "Workspace sync: Needs attention" }),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByRole("button", { name: "Workspace sync: Needs attention" }),
    )
    .toBeVisible();
  await screen
    .getByRole("button", { name: "Workspace sync: Needs attention" })
    .click();
  await expect
    .element(screen.getByRole("button", { name: "Open Data settings" }))
    .toBeVisible();
  expect(exposed.state.theme).toBe("dark");
  expect(remote.calls.filter((call) => call === "read")).toHaveLength(1);
});

test("guest workspaces have no sync control", async () => {
  const source = {
    owner: { kind: "guest" as const },
    load: () => state(),
    save: () => {},
  };
  const screen = await render(
    <WorkspaceProvider dataSource={source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await expect.element(screen.getByTestId("theme")).toBeVisible();
  expect(document.querySelector('[aria-label^="Workspace sync:"]')).toBeNull();
});

test("sync popover is keyboard accessible and fits a mobile viewport", async () => {
  const remote = server();
  const screen = await render(
    <WorkspaceProvider dataSource={remote.source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await page.viewport(390, 844);
  const trigger = screen.getByRole("button", { name: "Workspace sync: Saved" });
  await expect.element(trigger).toBeVisible();
  (
    document.querySelector(
      '[aria-label="Workspace sync: Saved"]',
    ) as HTMLButtonElement
  ).focus();
  await userEvent.keyboard("{Enter}");
  await expect
    .element(screen.getByRole("button", { name: "Sync now", exact: true }))
    .toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(trigger).toHaveFocus();
  await page.viewport(1280, 720);
});

test("safe refresh refuses staged edits without making a remote read", async () => {
  const remote = server();
  const signal = new AbortController().signal;
  await remote.source.load(signal);
  const edited = { ...state([task("a"), task("b")]), theme: "dark" as const };
  await remote.source.stage(edited, signal);
  await expect(remote.source.refresh(signal)).rejects.toMatchObject({
    code: "sync_pending",
  });
  expect(remote.calls).toEqual(["read"]);
  expect(remote.source.recoverySnapshot?.theme).toBe("dark");
});

test("unmount cancels remote adoption and ignores late responses", async () => {
  const remote = server();
  const screen = await render(
    <WorkspaceProvider dataSource={remote.source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await expect
    .element(screen.getByRole("button", { name: "Workspace sync: Saved" }))
    .toBeVisible();
  remote.edit({ ...exposed.state, theme: "light" });
  let finish!: () => void;
  remote.pause(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const sync = exposed.syncNow();
  await expect
    .element(screen.getByRole("button", { name: "Workspace sync: Saving" }))
    .toBeVisible();
  await screen.unmount();
  remote.pause(null);
  finish();
  expect(await sync).toBe(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function server() {
  let snapshot = state([task("a"), task("b")]);
  let revision = 1;
  let failure = "";
  let wait: Promise<void> | null = null;
  const calls: string[] = [];
  const source = new AccountWorkspaceDataSource({
    owner: { kind: "account", userId: crypto.randomUUID() },
    sessionId: "sync-session",
    request: async <T,>(
      _path: string,
      signal: AbortSignal,
      body?: unknown,
    ): Promise<T> => {
      calls.push(body ? "save" : "read");
      if (wait) await wait;
      signal.throwIfAborted();
      if (failure) throw new PersistenceError(failure, failure);
      if (!body) return { snapshot: structuredClone(snapshot), revision } as T;
      const input = body as { snapshot: Workspace; expectedRevision: number };
      if (input.expectedRevision !== revision)
        throw new PersistenceError("revision_conflict", "Conflict");
      snapshot = structuredClone(input.snapshot);
      return { committedRevision: ++revision, currentRevision: revision } as T;
    },
  });
  return {
    source,
    calls,
    edit: (next: Workspace) => {
      snapshot = next;
      revision++;
    },
    fail: (code: string) => {
      failure = code;
    },
    pause: (promise: Promise<void> | null) => {
      wait = promise;
    },
  };
}

let exposed: ReturnType<typeof useWorkspace>;
function Harness() {
  const workspace = useWorkspace();
  useEffect(() => {
    exposed = workspace;
  });
  if (!workspace.ready) return <p>Loading</p>;
  return (
    <>
      <p data-testid="theme">{workspace.state.theme}</p>
      <button
        onClick={() =>
          workspace.act({ type: "theme", theme: "dark" }, "Theme changed")
        }
      >
        Edit workspace
      </button>
      <button onClick={() => void workspace.syncNow()}>Run sync</button>
      <button onClick={workspace.undo}>Undo</button>
      <WorkspaceSyncControl openData={() => {}} />
    </>
  );
}

function DraftHarness({ initial }: { initial: Workspace }) {
  const workspace = useWorkspace();
  return workspace.ready ? <ReadyDraftHarness initial={initial} /> : null;
}

function ReadyDraftHarness({ initial }: { initial: Workspace }) {
  const [original] = useState(() => get(initial, "a"));
  const session = useEditorSession(original, false, () => {});
  return (
    <>
      <button onClick={() => session.update(original, { title: "My draft" })}>
        Draft title
      </button>
      <button
        disabled={session.conflicts.length > 0}
        onClick={() =>
          session.commitEditorDrafts(
            session.entries,
            Object.values(session.entries).map(session.expectation),
            "Draft saved",
          )
        }
      >
        Save draft
      </button>
      <DraftReview session={session} />
      <p data-testid="task-title">
        {session.state.tasks.find((t) => t.id === "a")?.title ?? "Deleted"}
      </p>
      <p data-testid="task-description">
        {session.state.tasks.find((t) => t.id === "a")?.description ??
          "Deleted"}
      </p>
    </>
  );
}

test("manual sync flushes first, pauses mutations, rejects duplicate clicks, and resumes", async () => {
  const remote = server();
  const screen = await render(
    <WorkspaceProvider dataSource={remote.source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await expect
    .element(screen.getByRole("button", { name: "Workspace sync: Saved" }))
    .toBeVisible();
  await screen.getByRole("button", { name: "Edit workspace" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Workspace sync: Pending" }))
    .toBeVisible();
  let finish!: () => void;
  remote.pause(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await screen.getByRole("button", { name: "Run sync" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Workspace sync: Saving" }))
    .toBeVisible();
  expect(exposed.act({ type: "theme", theme: "light" })).toBe(false);
  expect(await exposed.syncNow()).toBe(false);
  remote.pause(null);
  finish();
  await expect
    .element(screen.getByRole("button", { name: "Workspace sync: Saved" }))
    .toBeVisible();
  expect(remote.calls.slice(-2)).toEqual(["save", "read"]);
  expect(exposed.state.theme).toBe("dark");
});

test("failed saves prevent retrieval; retry succeeds and malformed refresh preserves local data", async () => {
  const remote = server();
  const screen = await render(
    <WorkspaceProvider dataSource={remote.source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await screen.getByRole("button", { name: "Edit workspace" }).click();
  remote.fail("network_error");
  await screen.getByRole("button", { name: "Run sync" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Workspace sync: Offline" }))
    .toBeVisible();
  expect(remote.calls.filter((c) => c === "read")).toHaveLength(1);
  remote.fail("");
  await screen.getByRole("button", { name: "Run sync" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Workspace sync: Saved" }))
    .toBeVisible();
  remote.edit({ ...exposed.state, tasks: [{ id: "invalid" }] } as Workspace);
  await screen.getByRole("button", { name: "Run sync" }).click();
  await expect
    .element(
      screen.getByRole("button", { name: "Workspace sync: Needs attention" }),
    )
    .toBeVisible();
  expect(exposed.state.theme).toBe("dark");
  expect(exposed.state.tasks).toHaveLength(2);
});

test("different adoption invalidates captured Undo and stale provider draft submission", async () => {
  const remote = server();
  const screen = await render(
    <WorkspaceProvider dataSource={remote.source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await screen.getByRole("button", { name: "Edit workspace" }).click();
  await screen.getByRole("button", { name: "Run sync" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Workspace sync: Saved" }))
    .toBeVisible();
  const staleUndo = exposed.undo;
  const before = exposed.state;
  const original = get(before, "a");
  const entries: DraftEntries = {
    a: {
      original,
      changes: { title: "Stale draft" },
      isNew: false,
      scope: "occurrence",
    },
  };
  const staleCommit = exposed.commitEditorDrafts;
  const expected = [{ entry: entries.a, key: draftKey(before, entries.a) }];
  remote.edit({
    ...before,
    theme: "light",
    tasks: before.tasks.map((t) =>
      t.id === "a" ? { ...t, description: "Remote description" } : t,
    ),
  });
  await screen.getByRole("button", { name: "Run sync" }).click();
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("light");
  staleUndo();
  expect(staleCommit(entries, expected, "Stale saved")).toBe(false);
  expect(exposed.readEditorState().theme).toBe("light");
  expect(exposed.readEditorState().tasks[0].description).toBe(
    "Remote description",
  );
});

test("review keeps only edited fields, repeats after another remote change, and handles deletion", async () => {
  const remote = server();
  const initial = state([task("a"), task("b")]);
  const screen = await render(
    <WorkspaceProvider dataSource={remote.source}>
      <Harness />
      <DraftHarness initial={initial} />
    </WorkspaceProvider>,
  );
  await screen.getByRole("button", { name: "Draft title" }).click();
  remote.edit({
    ...initial,
    tasks: initial.tasks.map((t) =>
      t.id === "a" ? { ...t, description: "Remote text" } : t,
    ),
  });
  await screen.getByRole("button", { name: "Run sync" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Save draft" }))
    .toBeDisabled();
  await screen.getByRole("button", { name: "Keep draft changes" }).click();
  await screen.getByRole("button", { name: "Save draft" }).click();
  await expect
    .element(screen.getByTestId("task-title"))
    .toHaveTextContent("My draft");
  await expect
    .element(screen.getByTestId("task-description"))
    .toHaveTextContent("Remote text");
  await screen.getByRole("button", { name: "Run sync" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Workspace sync: Saved" }))
    .toBeVisible();
  remote.edit({
    ...exposed.state,
    tasks: exposed.state.tasks.map((t) =>
      t.id === "a" ? { ...t, description: "Changed again" } : t,
    ),
  });
  await screen.getByRole("button", { name: "Run sync" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Save draft" }))
    .toBeDisabled();
  await screen.getByRole("button", { name: "Use remote" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Save draft" }))
    .toBeEnabled();
  remote.edit({
    ...exposed.state,
    tasks: exposed.state.tasks.filter((t) => t.id !== "a"),
  });
  await screen.getByRole("button", { name: "Run sync" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Keep draft changes" }))
    .toBeDisabled();
  await expect
    .element(screen.getByRole("button", { name: "Discard affected draft" }))
    .toBeVisible();
});
