import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import { newTask } from "@/lib/tasks/factory";
import { seedWorkspace } from "@/lib/workspace/seed";
import { STORAGE_KEY } from "@/stores/workspace/persistence";
import { useWorkspace, WorkspaceProvider } from "@/stores/workspace/provider";

function Harness() {
  const { state, ready, act, undo, notice, operationError, storageError } =
    useWorkspace();
  if (!ready) return <p>Loading</p>;
  return (
    <>
      <button
        onClick={() =>
          act({ type: "moveTag", id: "child", parentId: null }, "Moved")
        }
      >
        Move
      </button>
      <button
        onClick={() =>
          act({ type: "moveTag", id: "child", parentId: "child" }, "Invalid")
        }
      >
        Invalid
      </button>
      <button
        onClick={() =>
          act({ type: "moveTag", id: "child", parentId: null }, "No-op")
        }
      >
        No-op
      </button>
      <button
        onClick={() =>
          act({ type: "deleteEntity", kind: "tags", id: "root" }, "Deleted")
        }
      >
        Delete
      </button>
      <button onClick={undo}>Undo</button>
      <output data-testid="snapshot">{JSON.stringify(state)}</output>
      <p data-testid="notice">{notice?.message ?? "None"}</p>
      <p data-testid="error">{operationError}</p>
      <p data-testid="storage">{storageError ? "Session only" : "Saved"}</p>
    </>
  );
}
function seed() {
  const workspace = {
    ...seedWorkspace(),
    tasks: [{ ...newTask("Task"), id: "a", tagIds: ["root", "child"] }],
    tags: [
      { id: "root", name: "Root", color: "sky", parentId: null, order: 0 },
      { id: "child", name: "Child", color: "sky", parentId: "root", order: 0 },
    ],
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  return workspace;
}
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

test("failed and no-op operations preserve the successful Undo snapshot", async () => {
  const original = seed();
  const screen = await render(
    <WorkspaceProvider>
      <Harness />
    </WorkspaceProvider>,
  );
  await screen.getByRole("button", { name: "Move", exact: true }).click();
  await expect.element(screen.getByTestId("notice")).toHaveTextContent("Moved");
  const moved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  expect(moved.tags[1].parentId).toBeNull();
  await screen.getByRole("button", { name: "Invalid", exact: true }).click();
  await expect
    .element(screen.getByTestId("error"))
    .toHaveTextContent("Choose a parent");
  await expect
    .element(screen.getByTestId("snapshot"))
    .toHaveTextContent(JSON.stringify(moved));
  await screen.getByRole("button", { name: "No-op", exact: true }).click();
  await expect.element(screen.getByTestId("notice")).toHaveTextContent("Moved");
  await screen.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .element(screen.getByTestId("snapshot"))
    .toHaveTextContent(JSON.stringify(original));
  await expect
    .poll(() => JSON.parse(localStorage.getItem(STORAGE_KEY)!))
    .toEqual(original);
});

test("deletion persists one complete snapshot and Undo restores it", async () => {
  const original = seed();
  const screen = await render(
    <WorkspaceProvider>
      <Harness />
    </WorkspaceProvider>,
  );
  const writes = vi.spyOn(Storage.prototype, "setItem");
  await screen.getByRole("button", { name: "Delete", exact: true }).click();
  await expect
    .element(screen.getByTestId("notice"))
    .toHaveTextContent("Deleted");
  const commits = writes.mock.calls.filter(([key]) => key === STORAGE_KEY);
  expect(commits).toHaveLength(1);
  const saved = JSON.parse(commits[0][1]);
  expect(saved.tags).toEqual([{ ...original.tags[1], parentId: null }]);
  expect(saved.tasks[0].tagIds).toEqual(["child"]);
  await screen.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() => JSON.parse(localStorage.getItem(STORAGE_KEY)!))
    .toEqual(original);
});

test("write failure preserves in-memory mutation and Undo", async () => {
  const original = seed();
  const screen = await render(
    <WorkspaceProvider>
      <Harness />
    </WorkspaceProvider>,
  );
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Quota exceeded");
  });
  await screen.getByRole("button", { name: "Delete", exact: true }).click();
  await expect
    .element(screen.getByTestId("storage"))
    .toHaveTextContent("Session only");
  await expect
    .element(screen.getByTestId("notice"))
    .toHaveTextContent("Deleted");
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(original);
  await screen.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .element(screen.getByTestId("snapshot"))
    .toHaveTextContent(JSON.stringify(original));
});
