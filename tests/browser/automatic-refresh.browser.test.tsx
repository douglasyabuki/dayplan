import { useLayoutEffect } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";

import { emptyWorkspace } from "@/lib/workspace/empty";
import {
  AccountWorkspaceDataSource,
  PersistenceError,
} from "@/stores/workspace/account-data-source";
import { useWorkspace, WorkspaceProvider } from "@/stores/workspace/provider";
import { writeRecovery } from "@/stores/workspace/recovery-journal";
import type { Workspace } from "@/types-and-constants/workspace";

type View = ReturnType<typeof useWorkspace>;
const views = new Map<string, View>();
let clock = 0;

beforeEach(() => {
  clock = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  views.clear();
});

function Harness({ name }: { name: string }) {
  const workspace = useWorkspace();
  useLayoutEffect(() => {
    views.set(name, workspace);
  });
  return <p>{workspace.syncStatus}</p>;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function server() {
  let snapshot = emptyWorkspace();
  let revision = 1;
  const userId = crypto.randomUUID();
  const receipts = new Map<string, number>();
  const calls: { device: string; body?: unknown }[] = [];
  let gate: ReturnType<typeof deferred> | null = null;
  let readError = "";
  let loseSave = false;
  return {
    userId,
    calls,
    edit(next: Workspace) {
      snapshot = next;
      revision++;
    },
    pauseRead() {
      gate = deferred();
      return gate;
    },
    failRead(code: string) {
      readError = code;
    },
    loseNextSave() {
      loseSave = true;
    },
    source(device: string) {
      return new AccountWorkspaceDataSource({
        owner: { kind: "account", userId },
        sessionId: device,
        request: async <T,>(
          _path: string,
          _signal: AbortSignal,
          body?: unknown,
        ): Promise<T> => {
          calls.push({ device, body });
          if (!body) {
            const result = { snapshot: structuredClone(snapshot), revision };
            const waiting = gate;
            gate = null;
            if (waiting) await waiting.promise;
            // Deliberately ignore transport abort; the real adapter must reject it.
            if (readError) throw new PersistenceError(readError, readError);
            return result as T;
          }
          const input = body as {
            operationId: string;
            expectedRevision: number;
            snapshot: Workspace;
          };
          let committedRevision = receipts.get(input.operationId);
          if (!committedRevision) {
            if (input.expectedRevision !== revision)
              throw new PersistenceError("revision_conflict", "Conflict");
            snapshot = structuredClone(input.snapshot);
            committedRevision = ++revision;
            receipts.set(input.operationId, committedRevision);
          }
          if (loseSave) {
            loseSave = false;
            throw new PersistenceError("network_error", "Lost save response");
          }
          return { committedRevision, currentRevision: revision } as T;
        },
      });
    },
  };
}

async function mount(remote: ReturnType<typeof server>, name = "b") {
  const source = remote.source(name);
  const refresh = vi.spyOn(source, "refresh");
  const screen = await render(
    <WorkspaceProvider dataSource={source}>
      <Harness name={name} />
    </WorkspaceProvider>,
  );
  await expect.poll(() => views.get(name)?.ready).toBe(true);
  await expect.poll(() => views.get(name)?.syncStatus).toBe("Saved");
  return { source, screen, refresh };
}

function returnToPage() {
  clock += 31000;
  window.dispatchEvent(new Event("focus"));
}

const reads = (remote: ReturnType<typeof server>, device = "b") =>
  remote.calls.filter((call) => call.device === device && !call.body).length;

test("a confirmed edit on device A appears on clean device B with one GET, unchanged checks also use one GET", async () => {
  const remote = server();
  await mount(remote, "a");
  await mount(remote);
  views.get("a")!.act({ type: "theme", theme: "dark" });
  expect(await views.get("a")!.syncNow()).toBe(true);
  returnToPage();
  await expect.poll(() => views.get("b")!.state.theme).toBe("dark");
  expect(reads(remote)).toBe(2); // initial + changed
  expect(
    remote.calls.filter((call) => call.device === "b" && call.body),
  ).toHaveLength(0);
  returnToPage();
  await expect.poll(() => reads(remote)).toBe(3); // one unchanged check
  expect(views.get("b")!.adoptionEpoch).toBe(1);
});

test("focus, visible and online bursts share a flight and completion cooldown", async () => {
  const remote = server();
  const { refresh } = await mount(remote);
  const wait = remote.pauseRead();
  returnToPage();
  await expect.poll(() => reads(remote)).toBe(2);
  for (let i = 0; i < 5; i++) {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
  }
  expect(await views.get("b")!.syncNow()).toBe(false);
  expect(reads(remote)).toBe(2);
  wait.resolve();
  await refresh.mock.results[0].value;
  await expect.poll(() => views.get("b")!.syncAvailable).toBe(true);
  window.dispatchEvent(new Event("focus"));
  expect(reads(remote)).toBe(2);
});

test("pending edits do not flush on focus; saved Undo and Redo history defer background adoption", async () => {
  const remote = server();
  await mount(remote);
  views.get("b")!.act({ type: "theme", theme: "dark" });
  returnToPage();
  expect(remote.calls).toHaveLength(1);
  expect(views.get("b")!.readEditorState().theme).toBe("dark");
  expect(await views.get("b")!.syncNow()).toBe(true);
  views.get("b")!.act({
    type: "entity",
    kind: "projects",
    entity: { id: "p", name: "Local", color: "sky" },
  });
  expect(await views.get("b")!.syncNow()).toBe(true);
  await expect.poll(() => views.get("b")!.canUndo).toBe(true);
  const count = reads(remote);
  remote.edit({ ...views.get("b")!.state, projects: [] });
  returnToPage();
  expect(reads(remote)).toBe(count);
  expect(views.get("b")!.canUndo).toBe(true);
  views.get("b")!.undo();
  await expect.poll(() => views.get("b")!.canRedo).toBe(true);
  returnToPage();
  expect(reads(remote)).toBe(count);
});

test("an edit during refresh keeps the old revision and later conflicts instead of silently rebasing", async () => {
  const remote = server();
  const { refresh } = await mount(remote);
  remote.edit({ ...emptyWorkspace(), theme: "light" });
  const wait = remote.pauseRead();
  returnToPage();
  await expect.poll(() => reads(remote)).toBe(2);
  await expect.poll(() => views.get("b")!.syncAvailable).toBe(false);
  views.get("b")!.act({ type: "theme", theme: "dark" });
  wait.resolve();
  await expect(refresh.mock.results[0].value).rejects.toMatchObject({
    code: "sync_pending",
  });
  await expect.poll(() => views.get("b")!.syncStatus).toBe("Pending");
  await expect.poll(() => views.get("b")!.syncAvailable).toBe(true);
  expect(views.get("b")!.readEditorState().theme).toBe("dark");
  // Wait for the read lane to finish without issuing another retrieval.
  const source = remote.calls;
  expect(await views.get("b")!.syncNow()).toBe(false);
  await expect.poll(() => views.get("b")!.syncStatus).toBe("Needs attention");
  expect(source.filter((call) => call.body).at(-1)?.body).toMatchObject({
    expectedRevision: 1,
  });
  expect(reads(remote)).toBe(2);
});

test("draft holds opened and closed during a read reject the response without advancing revision", async () => {
  const remote = server();
  const { source, refresh } = await mount(remote);
  const release = views.get("b")!.holdRemoteRefresh();
  returnToPage();
  expect(reads(remote)).toBe(1);
  release();
  remote.edit({ ...emptyWorkspace(), theme: "light" });
  const wait = remote.pauseRead();
  returnToPage();
  await expect.poll(() => reads(remote)).toBe(2);
  const close = views.get("b")!.holdRemoteRefresh();
  close();
  wait.resolve();
  await expect(refresh.mock.results[0].value).rejects.toMatchObject({
    code: "sync_pending",
  });
  await expect
    .poll(() => source.isSaved(views.get("b")!.readEditorState()))
    .toBe(true);
  expect(views.get("b")!.readEditorState().theme).toBe("system");
});

test("unknown save outcomes block automatic reads and manual retry preserves the immutable payload", async () => {
  const remote = server();
  await mount(remote);
  views.get("b")!.act({ type: "theme", theme: "dark" });
  remote.loseNextSave();
  expect(await views.get("b")!.syncNow()).toBe(false);
  const first = remote.calls.find((call) => call.body)!.body;
  returnToPage();
  expect(reads(remote)).toBe(1);
  expect(await views.get("b")!.syncNow()).toBe(true);
  expect(
    remote.calls.filter((call) => call.body).map((call) => call.body),
  ).toEqual([first, first]);
  expect(reads(remote)).toBe(2);
});

test("another writer's unresolved recovery defers the GET and leaves its record intact", async () => {
  const remote = server();
  await mount(remote);
  const writerId = crypto.randomUUID();
  await writeRecovery(
    {
      version: 1,
      userId: remote.userId,
      writerId,
      sequence: 1,
      generation: 1,
      baseRevision: 1,
      latest: { ...emptyWorkspace(), theme: "dark" },
      operation: null,
    },
    0,
    new AbortController().signal,
  );
  returnToPage();
  // A direct guarded refresh awaits the same durable check and proves deferral.
  await expect(
    remote.source("other").refresh(new AbortController().signal, () => true),
  ).rejects.toMatchObject({ code: "sync_pending" });
  expect(reads(remote)).toBe(1);
  expect(views.get("b")!.state.theme).toBe("system");
});

test("hidden and offline events do no work; a network failure retries on a later eligible event", async () => {
  const remote = server();
  await mount(remote);
  vi.mocked(
    Object.getOwnPropertyDescriptor(document, "visibilityState")!.get!,
  ).mockReturnValue("hidden");
  returnToPage();
  expect(reads(remote)).toBe(1);
  vi.mocked(
    Object.getOwnPropertyDescriptor(document, "visibilityState")!.get!,
  ).mockReturnValue("visible");
  vi.mocked(
    Object.getOwnPropertyDescriptor(navigator, "onLine")!.get!,
  ).mockReturnValue(false);
  returnToPage();
  expect(reads(remote)).toBe(1);
  vi.mocked(
    Object.getOwnPropertyDescriptor(navigator, "onLine")!.get!,
  ).mockReturnValue(true);
  remote.failRead("network_error");
  returnToPage();
  await expect.poll(() => views.get("b")!.syncStatus).toBe("Offline");
  window.dispatchEvent(new Event("online"));
  expect(reads(remote)).toBe(2);
  remote.failRead("");
  remote.edit({ ...emptyWorkspace(), theme: "light" });
  returnToPage();
  await expect.poll(() => views.get("b")!.state.theme).toBe("light");
  await expect.poll(() => views.get("b")!.syncStatus).toBe("Saved");
  expect(reads(remote)).toBe(3);
});

test.each(["logout", "account", "session"] as const)(
  "%s rejects a late background response even when transport ignores abort",
  async (transition) => {
    const remote = server();
    const { screen, source } = await mount(remote);
    const refresh = vi.mocked(source.refresh);
    remote.edit({ ...emptyWorkspace(), theme: "light" });
    const wait = remote.pauseRead();
    returnToPage();
    await expect.poll(() => reads(remote)).toBe(2);
    const other = server();
    const nextSource =
      transition === "logout"
        ? {
            owner: { kind: "guest" as const },
            load: () => emptyWorkspace(),
            save: () => {},
          }
        : transition === "session"
          ? source
          : other.source("new-account");
    await screen.rerender(
      <WorkspaceProvider key="new-scope" dataSource={nextSource}>
        <Harness name="new-scope" />
      </WorkspaceProvider>,
    );
    wait.resolve();
    await expect(refresh.mock.results[0].value).rejects.toThrow();
    await expect.poll(() => views.get("new-scope")?.ready).toBe(true);
    await expect
      .poll(() => views.get("new-scope")!.state.theme)
      .toBe(transition === "session" ? "light" : "system");
    if (transition !== "session")
      expect(source.isSaved(emptyWorkspace())).toBe(true);
  },
);
