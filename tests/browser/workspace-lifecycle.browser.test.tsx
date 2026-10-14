import { StrictMode, useEffect, useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import {
  type OwnerDataSources,
  WorkspaceOwnerBoundary,
} from "@/components/workspace/workspace-owner";
import { seedWorkspace } from "@/lib/workspace/seed";
import { useAccount } from "@/stores/account/provider";
import {
  guestOwner,
  ownerKey,
  type Session,
  type WorkspaceOwner,
} from "@/stores/session/model";
import { SessionProvider } from "@/stores/session/provider";
import type { WorkspaceDataSource } from "@/stores/workspace/data-source";
import {
  guestWorkspaceDataSource,
  STORAGE_KEY,
} from "@/stores/workspace/persistence";
import { useWorkspace, WorkspaceProvider } from "@/stores/workspace/provider";
import type { Workspace } from "@/types-and-constants/workspace";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function Harness({
  capture,
}: {
  capture?: (workspace: ReturnType<typeof useWorkspace>) => void;
}) {
  const workspace = useWorkspace();
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (workspace.ready) capture?.(workspace);
  }, [workspace, capture]);
  if (!workspace.ready) return <p>Loading workspace</p>;
  return (
    <>
      <p data-testid="theme">{workspace.state.theme}</p>
      <p data-testid="notice">{workspace.notice?.message ?? "None"}</p>
      <p data-testid="confirmation">
        {workspace.confirmation?.title ?? "None"}
      </p>
      <p data-testid="storage-error">{workspace.error || "None"}</p>
      <p data-testid="operation-error">{workspace.operationError || "None"}</p>
      <input
        aria-label="Workspace draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button
        onClick={() =>
          workspace.act({ type: "theme", theme: "dark" }, "Changed")
        }
      >
        Dark
      </button>
      <button
        onClick={() =>
          workspace.act({ type: "theme", theme: "light" }, "Changed")
        }
      >
        Light
      </button>
      <button
        onClick={() =>
          workspace.act({ type: "moveTag", id: "missing", parentId: "missing" })
        }
      >
        Invalid
      </button>
      <button onClick={workspace.undo}>Undo</button>
      <button onClick={workspace.reset}>Reset</button>
      <button onClick={workspace.acceptConfirmation}>Confirm</button>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

test("delayed loading gates readiness and edits remain immediate while saving", async () => {
  const load = deferred<Workspace>();
  const save = deferred<void>();
  const write = vi
    .fn()
    .mockImplementationOnce(() => save.promise)
    .mockReturnValue(undefined);
  const source: WorkspaceDataSource = {
    owner: guestOwner,
    load: () => load.promise,
    save: write,
  };
  const screen = await render(
    <WorkspaceProvider dataSource={source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await expect.element(screen.getByText("Loading workspace")).toBeVisible();
  expect(write).not.toHaveBeenCalled();
  load.resolve({ ...seedWorkspace(), theme: "system" });
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("system");
  await screen.getByRole("button", { name: "Dark", exact: true }).click();
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("dark");
  await screen.getByRole("button", { name: "Light", exact: true }).click();
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("light");
  expect(write).toHaveBeenCalledTimes(1);
  save.resolve();
  await expect
    .poll(() => write.mock.calls.map(([state]) => state.theme))
    .toEqual(["system", "light"]);
});

test.each(["malformed", "unavailable"])(
  "%s storage is preserved and disables writes until reset succeeds",
  async (kind) => {
    if (kind === "malformed") localStorage.setItem(STORAGE_KEY, "broken json");
    else
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("Storage blocked");
      });
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const screen = await render(
      <WorkspaceProvider dataSource={guestWorkspaceDataSource}>
        <Harness />
      </WorkspaceProvider>,
    );
    await expect
      .element(screen.getByRole("button", { name: "Dark", exact: true }))
      .toBeVisible();
    await screen.getByRole("button", { name: "Dark", exact: true }).click();
    expect(writes).not.toHaveBeenCalled();
    await expect
      .element(screen.getByTestId("storage-error"))
      .not.toHaveTextContent("None");
    await screen.getByRole("button", { name: "Reset", exact: true }).click();
    await screen.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect
      .element(screen.getByTestId("storage-error"))
      .toHaveTextContent("None");
    await screen.getByRole("button", { name: "Light", exact: true }).click();
    expect(
      writes.mock.calls.filter(([key]) => key === STORAGE_KEY).length,
    ).toBeGreaterThan(0);
  },
);

test("async reset cannot replace edits made after confirmation", async () => {
  const pending = deferred<void>();
  const save = vi
    .fn()
    .mockReturnValueOnce(undefined)
    .mockImplementationOnce(() => pending.promise)
    .mockReturnValue(undefined);
  const source: WorkspaceDataSource = {
    owner: guestOwner,
    load: () => ({ ...seedWorkspace(), theme: "light" }),
    save,
  };
  const screen = await render(
    <WorkspaceProvider dataSource={source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await screen.getByRole("button", { name: "Reset", exact: true }).click();
  await screen.getByRole("button", { name: "Confirm", exact: true }).click();
  await screen.getByRole("button", { name: "Dark", exact: true }).click();
  pending.resolve();
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("dark");
  await expect
    .element(screen.getByTestId("operation-error"))
    .toHaveTextContent("Your edits were kept");
  await expect.poll(() => save.mock.calls.at(-1)?.[0].theme).toBe("dark");
});

test("failed reset preserves workspace and Undo", async () => {
  const save = vi
    .fn()
    .mockReturnValueOnce(undefined)
    .mockReturnValueOnce(undefined)
    .mockImplementationOnce(() => {
      throw new Error("Quota");
    });
  const source: WorkspaceDataSource = {
    owner: guestOwner,
    load: () => ({ ...seedWorkspace(), theme: "light" }),
    save,
  };
  const screen = await render(
    <WorkspaceProvider dataSource={source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await screen.getByRole("button", { name: "Dark", exact: true }).click();
  await screen.getByRole("button", { name: "Reset", exact: true }).click();
  await screen.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("dark");
  await expect
    .element(screen.getByTestId("notice"))
    .toHaveTextContent("Changed");
  await expect
    .element(screen.getByTestId("storage-error"))
    .toHaveTextContent("Reset was not saved");
  await screen.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("light");
});

test("Strict Mode cancels its abandoned load without persisting an initial placeholder", async () => {
  const pending = deferred<Workspace>();
  const save = vi.fn();
  const source: WorkspaceDataSource = {
    owner: guestOwner,
    load: () => pending.promise,
    save,
  };
  const screen = await render(
    <StrictMode>
      <WorkspaceProvider dataSource={source}>
        <Harness />
      </WorkspaceProvider>
    </StrictMode>,
  );
  expect(save).not.toHaveBeenCalled();
  pending.resolve({ ...seedWorkspace(), theme: "dark" });
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("dark");
  await expect.poll(() => save.mock.calls.length).toBe(1);
  expect(save.mock.calls[0][0].theme).toBe("dark");
});

test("owner changes clear drafts, confirmations, errors and Undo; stale actions and late loads are isolated", async () => {
  const late = deferred<Workspace>();
  const makeSources = (
    owner: WorkspaceOwner,
    theme: Workspace["theme"],
  ): OwnerDataSources => {
    let stored = { ...seedWorkspace(), theme };
    return {
      workspace: {
        owner,
        load: () => stored,
        save: vi.fn((snapshot: Workspace) => {
          stored = snapshot;
        }),
      },
      profile: {
        owner,
        load: () => ({ name: ownerKey(owner) }),
        save: vi.fn(),
      },
    };
  };
  const guest = makeSources(guestOwner, "light");
  const a = makeSources({ kind: "account", userId: "a" }, "dark");
  a.workspace.load = () => late.promise;
  const b = makeSources({ kind: "account", userId: "b" }, "system");
  const sources = new Map([
    ["guest", guest],
    ["account:a", a],
    ["account:b", b],
  ]);
  const resolveDataSources = (owner: WorkspaceOwner) =>
    sources.get(ownerKey(owner))!;
  let retained!: ReturnType<typeof useWorkspace>;
  const capture = (workspace: ReturnType<typeof useWorkspace>) => {
    retained = workspace;
  };
  const view = (session: Session) => (
    <SessionProvider value={session}>
      <WorkspaceOwnerBoundary resolveDataSources={resolveDataSources}>
        <Harness capture={capture} />
      </WorkspaceOwnerBoundary>
    </SessionProvider>
  );
  const screen = await render(view({ status: "guest" }));
  await screen
    .getByRole("textbox", { name: "Workspace draft" })
    .fill("Unsaved task");
  await screen.getByRole("button", { name: "Dark", exact: true }).click();
  await screen.getByRole("button", { name: "Invalid", exact: true }).click();
  await screen.getByRole("button", { name: "Reset", exact: true }).click();
  const old = retained;
  await screen.rerender(view({ status: "authenticated", userId: "a" }));
  await expect.element(screen.getByText("Loading workspace")).toBeVisible();
  expect(old.act({ type: "theme", theme: "dark" })).toBe(false);
  old.undo();
  old.acceptConfirmation();
  await screen.rerender(view({ status: "authenticated", userId: "b" }));
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("system");
  await expect
    .element(screen.getByRole("textbox", { name: "Workspace draft" }))
    .toHaveValue("");
  for (const id of [
    "notice",
    "confirmation",
    "operation-error",
    "storage-error",
  ])
    await expect.element(screen.getByTestId(id)).toHaveTextContent("None");
  late.resolve({ ...seedWorkspace(), theme: "dark" });
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("system");
  expect(a.workspace.save).not.toHaveBeenCalled();
  await screen.rerender(view({ status: "guest" }));
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("dark");
  await expect.element(screen.getByTestId("notice")).toHaveTextContent("None");
});

test("unsupported account sessions do not read or mount the guest workspace", async () => {
  const reads = vi.spyOn(Storage.prototype, "getItem");
  const screen = await render(
    <SessionProvider value={{ status: "authenticated", userId: "a" }}>
      <WorkspaceOwnerBoundary>
        <Harness />
      </WorkspaceOwnerBoundary>
    </SessionProvider>,
  );
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("not available yet");
  expect(reads).not.toHaveBeenCalled();
});

test("a late profile update cannot change the next account", async () => {
  const update = deferred<void>();
  const ownerA: WorkspaceOwner = { kind: "account", userId: "a" };
  const ownerB: WorkspaceOwner = { kind: "account", userId: "b" };
  const makeSources = (owner: WorkspaceOwner): OwnerDataSources => ({
    workspace: { owner, load: () => seedWorkspace(), save() {} },
    profile: {
      owner,
      load: () => ({ name: ownerKey(owner) }),
      save: () => update.promise,
    },
  });
  const a = makeSources(ownerA),
    b = makeSources(ownerB);
  const resolveDataSources = (owner: WorkspaceOwner) =>
    ownerKey(owner) === "account:a" ? a : b;
  let account!: ReturnType<typeof useAccount>;
  function Profile() {
    const value = useAccount();
    useEffect(() => {
      account = value;
    }, [value]);
    return <p data-testid="name">{value.profile.name}</p>;
  }
  const view = (userId: string) => (
    <SessionProvider value={{ status: "authenticated", userId }}>
      <WorkspaceOwnerBoundary resolveDataSources={resolveDataSources}>
        <Profile />
      </WorkspaceOwnerBoundary>
    </SessionProvider>
  );
  const screen = await render(view("a"));
  await expect
    .element(screen.getByTestId("name"))
    .toHaveTextContent("account:a");
  const old = account;
  const result = old.updateName("Changed A");
  await screen.rerender(view("b"));
  update.resolve();
  expect(await result).toBe(false);
  expect(await old.updateName("Stale")).toBe(false);
  await expect
    .element(screen.getByTestId("name"))
    .toHaveTextContent("account:b");
});
