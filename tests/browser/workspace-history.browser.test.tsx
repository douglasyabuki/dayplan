import { useEffect } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import { toast } from "@/components/ui/toast";
import { WorkspaceHistoryControls } from "@/components/workspace/workspace-history-controls";
import { guestOwner } from "@/stores/session/model";
import {
  guestWorkspaceDataSource,
  STORAGE_KEY,
} from "@/stores/workspace/persistence";
import { useWorkspace, WorkspaceProvider } from "@/stores/workspace/provider";
import { state, task } from "@/tests/task-fixtures";

let exposed: ReturnType<typeof useWorkspace>;

function Harness() {
  const workspace = useWorkspace();
  useEffect(() => {
    exposed = workspace;
  });
  if (!workspace.ready) return <p>Loading</p>;
  return (
    <>
      <WorkspaceHistoryControls />
      <button
        onClick={() =>
          workspace.act(
            {
              type: "entity",
              kind: "projects",
              entity: { ...workspace.state.projects[0], name: "Edited" },
            },
            "Project updated",
          )
        }
      >
        Edit
      </button>
      <button
        onClick={() =>
          workspace.act({
            type: "entity",
            kind: "projects",
            entity: { ...workspace.state.projects[0], name: "Second" },
          })
        }
      >
        Edit without toast
      </button>
      <button onClick={() => workspace.act({ type: "theme", theme: "dark" })}>
        Appearance
      </button>
      <button onClick={workspace.dismissNotice}>Dismiss</button>
      <button
        onClick={() =>
          workspace.confirm({
            title: "Confirm",
            description: "Confirm",
            action: () => {},
          })
        }
      >
        Confirm action
      </button>
      <output>{workspace.state.projects[0]?.name ?? "Empty"}</output>
      <input aria-label="Draft" />
      <div
        contentEditable
        suppressContentEditableWarning
        aria-label="Rich draft"
      >
        <span>Text</span>
      </div>
    </>
  );
}

function mount() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state([task("a")])));
  return render(
    <WorkspaceProvider dataSource={guestWorkspaceDataSource}>
      <Harness />
    </WorkspaceProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

test("dismissed feedback leaves history; excluded edits preserve redo and guest saves", async () => {
  const screen = await mount();
  const undo = screen.getByRole("button", { name: "Undo", exact: true });
  const redo = screen.getByRole("button", { name: "Redo", exact: true });
  await expect.element(undo).toBeDisabled();
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await screen.getByRole("button", { name: "Dismiss" }).click();
  await expect.element(undo).toBeEnabled();
  await undo.click();
  await screen.getByRole("button", { name: "Appearance" }).click();
  await expect.element(redo).toBeEnabled();
  await redo.click();
  expect(exposed.state.projects[0].name).toBe("Edited");
  expect(exposed.state.theme).toBe("dark");
  await expect
    .poll(() => JSON.parse(localStorage.getItem(STORAGE_KEY)!))
    .toEqual(exposed.state);
  await undo.click();
  await screen.getByRole("button", { name: "Edit without toast" }).click();
  await expect.element(redo).toBeDisabled();
  await screen.unmount();
  const reopened = await render(
    <WorkspaceProvider dataSource={guestWorkspaceDataSource}>
      <Harness />
    </WorkspaceProvider>,
  );
  await expect
    .element(reopened.getByRole("button", { name: "Undo", exact: true }))
    .toBeDisabled();
  expect(exposed.state.projects[0].name).toBe("Second");
});

test("stale toast Undo cannot reverse a newer silent action", async () => {
  const add = vi.spyOn(toast, "add");
  const screen = await mount();
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  const action = add.mock.calls.at(-1)![0].actionProps!;
  await screen.getByRole("button", { name: "Edit without toast" }).click();
  // Dispatch the captured action after its toast has been removed.
  const button = document.createElement("button");
  button.onclick = (event) =>
    action.onClick?.(
      event as unknown as Parameters<NonNullable<typeof action.onClick>>[0],
    );
  button.click();
  expect(exposed.readEditorState().projects[0].name).toBe("Second");
  await screen.getByRole("button", { name: "Undo", exact: true }).click();
  expect(exposed.state.projects[0].name).toBe("Edited");
});

test("keyboard shortcuts preserve editable targets and ignore unrelated or blocked events", async () => {
  const screen = await mount();
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await userEvent.keyboard("{Control>}z{/Control}");
  expect(exposed.state.projects[0].name).toBe("Project");
  await userEvent.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");
  expect(exposed.state.projects[0].name).toBe("Edited");
  const input = document.querySelector("input")!;
  const editable = document.querySelector("[contenteditable] span")!;
  for (const target of [input, editable]) {
    const event = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(exposed.readEditorState().projects[0].name).toBe("Edited");
  }
  for (const options of [
    { altKey: true },
    { repeat: true },
    { isComposing: true },
  ]) {
    const event = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      cancelable: true,
      ...options,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  const handled = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    cancelable: true,
  });
  handled.preventDefault();
  window.dispatchEvent(handled);
  expect(exposed.readEditorState().projects[0].name).toBe("Edited");
  await screen.getByRole("button", { name: "Confirm action" }).click();
  await userEvent.keyboard("{Control>}z{/Control}");
  expect(exposed.state.projects[0].name).toBe("Edited");
});

test("successful replacement clears both directions and captured callbacks; failed replacement preserves them", async () => {
  let fail = false;
  const save = vi.fn(() => {
    if (fail) throw new Error("Quota");
  });
  const original = state([task("a")]);
  const screen = await render(
    <WorkspaceProvider
      dataSource={{ owner: guestOwner, load: () => original, save }}
    >
      <Harness />
    </WorkspaceProvider>,
  );
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  const oldUndo = exposed.undo;
  fail = true;
  exposed.restoreBackup(original);
  await expect.poll(() => exposed.confirmation?.title).toBe("Restore backup?");
  exposed.acceptConfirmation();
  await expect.poll(() => exposed.busy).toBe(false);
  expect(exposed.canUndo).toBe(true);
  fail = false;
  exposed.retrySave();
  await expect.poll(() => exposed.error).toBe("");
  exposed.restoreBackup(original);
  await expect.poll(() => exposed.confirmation?.title).toBe("Restore backup?");
  exposed.acceptConfirmation();
  await expect.poll(() => exposed.canUndo).toBe(false);
  expect(exposed.canRedo).toBe(false);
  await screen.getByRole("button", { name: "Edit without toast" }).click();
  expect(oldUndo()).toBe(false);
  expect(exposed.readEditorState().projects[0].name).toBe("Second");
});

test.each(["reset", "clearData"] as const)(
  "successful %s clears redo and rejects captured redo callbacks",
  async (operation) => {
    const screen = await mount();
    await screen.getByRole("button", { name: "Edit", exact: true }).click();
    await screen.getByRole("button", { name: "Undo", exact: true }).click();
    const oldRedo = exposed.redo;
    expect(exposed.canRedo).toBe(true);
    exposed[operation]();
    await expect.poll(() => exposed.confirmation).not.toBeNull();
    exposed.acceptConfirmation();
    await expect.poll(() => exposed.canRedo).toBe(false);
    expect(exposed.canUndo).toBe(false);
    expect(oldRedo()).toBe(false);
  },
);
