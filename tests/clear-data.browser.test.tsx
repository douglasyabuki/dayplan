import "@/app/globals.css";

import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import { DataPanel } from "@/components/settings/data-panel";
import { WorkspaceFeedback } from "@/components/workspace/workspace-feedback";
import { seedWorkspace } from "@/lib/workspace/seed";
import type { WorkspaceDataSource } from "@/stores/workspace/data-source";
import { useWorkspace, WorkspaceProvider } from "@/stores/workspace/provider";
import type { Workspace } from "@/types-and-constants/workspace";

afterEach(() => vi.restoreAllMocks());

function Harness() {
  const workspace = useWorkspace();
  if (!workspace.ready) return <p>Loading</p>;
  return (
    <>
      <p data-testid="tasks">{workspace.state.tasks.length}</p>
      <DataPanel onReset={workspace.reset} onClear={workspace.clearData} />
      <WorkspaceFeedback />
    </>
  );
}

for (const kind of ["guest", "account"] as const) {
  test(`${kind} clear requires confirmation, preserves preferences, and persists an empty workspace`, async () => {
    const initial: Workspace = {
      ...seedWorkspace(),
      theme: "dark",
      timezone: "America/Sao_Paulo",
    };
    const save = vi.fn<(snapshot: Workspace) => void>(() => undefined);
    const source: WorkspaceDataSource = {
      owner: kind === "guest" ? { kind } : { kind, userId: "isolated-account" },
      load: () => initial,
      save,
    };
    const screen = await render(
      <WorkspaceProvider dataSource={source}>
        <Harness />
      </WorkspaceProvider>,
    );
    await screen
      .getByRole("button", { name: "Clear data", exact: true })
      .click();
    await expect
      .element(screen.getByRole("dialog"))
      .toHaveTextContent("This cannot be undone.");
    await expect
      .element(screen.getByRole("button", { name: "Cancel", exact: true }))
      .toHaveFocus();
    expect(save.mock.calls.every(([snapshot]) => snapshot === initial)).toBe(
      true,
    );
    await screen.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(save.mock.calls.every(([snapshot]) => snapshot === initial)).toBe(
      true,
    );
    await expect
      .element(screen.getByTestId("tasks"))
      .toHaveTextContent(String(initial.tasks.length));
    await screen
      .getByRole("button", { name: "Clear data", exact: true })
      .click();
    await screen
      .getByRole("dialog")
      .getByRole("button", { name: "Clear data", exact: true })
      .click();
    await expect.element(screen.getByTestId("tasks")).toHaveTextContent("0");
    expect(save).toHaveBeenCalled();
    expect(save.mock.calls.at(-1)![0]).toMatchObject({
      tasks: [],
      projects: [],
      tags: [],
      sections: [],
      layouts: {},
      exceptions: {},
      theme: "dark",
      timezone: "America/Sao_Paulo",
    });
  });
}

test("a failed clear keeps the account workspace and exposes retry", async () => {
  const initial = seedWorkspace();
  const source: WorkspaceDataSource = {
    owner: { kind: "account", userId: "isolated-account" },
    load: () => initial,
    save: (snapshot) =>
      snapshot.tasks.length === 0
        ? Promise.reject(new Error("Save unavailable"))
        : undefined,
  };
  const screen = await render(
    <WorkspaceProvider dataSource={source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await screen.getByRole("button", { name: "Clear data", exact: true }).click();
  await screen
    .getByRole("dialog")
    .getByRole("button", { name: "Clear data", exact: true })
    .click();
  await expect
    .element(screen.getByRole("button", { name: "Retry save" }))
    .toBeVisible();
  await expect
    .element(screen.getByTestId("tasks"))
    .toHaveTextContent(String(initial.tasks.length));
});
