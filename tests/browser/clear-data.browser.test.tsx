import "@/app/globals.css";

import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import { DataPanel } from "@/components/settings/data-panel";
import { WorkspaceFeedback } from "@/components/workspace/workspace-feedback";
import { emptyWorkspace } from "@/lib/workspace/empty";
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
      <p data-testid="theme">{workspace.state.theme}</p>
      <p data-testid="timezone">{workspace.state.timezone}</p>
      <DataPanel onReset={workspace.reset} onClear={workspace.clearData} />
      <WorkspaceFeedback />
    </>
  );
}

for (const kind of ["guest", "account"] as const) {
  test(`${kind} sample reset requires confirmation, preserves preferences, and persists examples after reopening`, async () => {
    const initial: Workspace = {
      ...emptyWorkspace("Pacific/Auckland"),
      theme: "dark",
    };
    let saved = initial;
    const save = vi.fn((snapshot: Workspace) => {
      saved = snapshot;
    });
    const source: WorkspaceDataSource = {
      owner: kind === "guest" ? { kind } : { kind, userId: "sample-account" },
      load: () => saved,
      save,
    };
    const view = (
      <WorkspaceProvider dataSource={source}>
        <Harness />
      </WorkspaceProvider>
    );
    const screen = await render(view);
    await screen
      .getByRole("button", { name: "Reset to sample data", exact: true })
      .click();
    await expect
      .element(screen.getByRole("dialog"))
      .toMatchTextContent(
        kind === "account" ? "in your account" : "in this browser",
      );
    await expect
      .element(screen.getByRole("dialog"))
      .toMatchTextContent("This cannot be undone.");
    await screen.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(saved).toBe(initial);
    await screen
      .getByRole("button", { name: "Reset to sample data", exact: true })
      .click();
    await screen
      .getByRole("dialog")
      .getByRole("button", { name: "Reset to sample data", exact: true })
      .click();
    await expect.poll(() => saved.tasks.length).toBeGreaterThan(0);
    expect(saved.projects.length).toBeGreaterThan(0);
    expect(saved.tags.length).toBeGreaterThan(0);
    expect(saved.theme).toBe("dark");
    expect(saved.timezone).toBe("Pacific/Auckland");
    await screen.unmount();
    const reopened = await render(view);
    await expect
      .element(reopened.getByTestId("tasks"))
      .toHaveTextContent(String(saved.tasks.length));
    await expect
      .element(reopened.getByTestId("theme"))
      .toHaveTextContent("dark");
  });

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
      .toMatchTextContent("This cannot be undone.");
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
    .element(
      screen
        .getByRole("region", { name: "Your workspace", exact: true })
        .getByRole("button", { name: "Retry save" }),
    )
    .toBeVisible();
  await expect
    .element(screen.getByTestId("tasks"))
    .toHaveTextContent(String(initial.tasks.length));
});

test("failed account sample reset preserves the workspace and retries the confirmed replacement", async () => {
  const initial = {
    ...emptyWorkspace("Pacific/Auckland"),
    theme: "dark" as const,
  };
  let saved: Workspace = initial;
  let fail = true;
  const source: WorkspaceDataSource = {
    owner: { kind: "account", userId: "sample-retry" },
    load: () => saved,
    save: (snapshot) => {
      if (snapshot.tasks.length && fail) {
        fail = false;
        return Promise.reject(new Error("Save unavailable"));
      }
      saved = snapshot;
    },
  };
  const screen = await render(
    <WorkspaceProvider dataSource={source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await screen
    .getByRole("button", { name: "Reset to sample data", exact: true })
    .click();
  await screen
    .getByRole("dialog")
    .getByRole("button", { name: "Reset to sample data", exact: true })
    .click();
  const recovery = screen.getByRole("region", {
    name: "Your workspace",
    exact: true,
  });
  await expect
    .element(recovery.getByRole("button", { name: "Retry save", exact: true }))
    .toBeVisible();
  expect(saved).toBe(initial);
  await expect.element(screen.getByTestId("tasks")).toHaveTextContent("0");
  await recovery
    .getByRole("button", { name: "Retry save", exact: true })
    .click();
  await expect.poll(() => saved.tasks.length).toBeGreaterThan(0);
  expect(saved).toMatchObject({ theme: "dark", timezone: "Pacific/Auckland" });
});
