import "@/app/globals.css";

import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import { DataPanel } from "@/components/settings/data-panel";
import { WorkspaceFeedback } from "@/components/workspace/workspace-feedback";
import { emptyWorkspace } from "@/lib/workspace/empty";
import { seedWorkspace } from "@/lib/workspace/seed";
import type { WorkspaceDataSource } from "@/stores/workspace/data-source";
import { useWorkspace, WorkspaceProvider } from "@/stores/workspace/provider";
import type { Workspace } from "@/types-and-constants/workspace";

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

const backup = { ...seedWorkspace("Pacific/Auckland"), theme: "dark" as const };
const backupFile = () =>
  new File([JSON.stringify(backup)], "backup.json", {
    type: "application/json",
  });

for (const kind of ["guest", "account"] as const) {
  test(`${kind} restores a backup only after confirmation and persists it after reopening`, async () => {
    const initial = emptyWorkspace("UTC");
    let saved: Workspace = initial;
    const source: WorkspaceDataSource = {
      owner: kind === "guest" ? { kind } : { kind, userId: "restore-account" },
      load: () => saved,
      save: (snapshot) => {
        saved = snapshot;
      },
    };
    const view = (
      <WorkspaceProvider dataSource={source}>
        <Harness />
      </WorkspaceProvider>
    );
    const screen = await render(view);
    await expect
      .element(
        screen.getByRole("button", { name: "Restore backup", exact: true }),
      )
      .toBeEnabled();
    await screen.getByLabelText("Backup file").upload(backupFile());
    await expect
      .element(screen.getByRole("dialog"))
      .toMatchTextContent(
        kind === "guest" ? "in this browser" : "in your account",
      );
    expect(saved).toBe(initial);
    await screen.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(saved).toBe(initial);
    // Selecting the same file again works after cancellation.
    await screen.getByLabelText("Backup file").upload(backupFile());
    await screen
      .getByRole("dialog")
      .getByRole("button", { name: "Restore backup", exact: true })
      .click();
    await expect.poll(() => saved).toEqual(backup);
    await expect
      .element(screen.getByTestId("tasks"))
      .toHaveTextContent(String(backup.tasks.length));
    await screen.unmount();
    const reopened = await render(view);
    await expect
      .element(reopened.getByTestId("tasks"))
      .toHaveTextContent(String(backup.tasks.length));
    expect(saved.theme).toBe("dark");
    expect(saved.timezone).toBe("Pacific/Auckland");
  });
}

test("malformed, unsupported, and invalid backups never replace the workspace", async () => {
  const initial = emptyWorkspace("UTC");
  const save = vi.fn();
  const screen = await render(
    <WorkspaceProvider
      dataSource={{ owner: { kind: "guest" }, load: () => initial, save }}
    >
      <Harness />
    </WorkspaceProvider>,
  );
  await expect
    .element(
      screen.getByRole("button", { name: "Restore backup", exact: true }),
    )
    .toBeEnabled();
  for (const text of [
    "broken JSON",
    JSON.stringify({ ...backup, version: 999 }),
    JSON.stringify({ ...backup, timezone: "invalid" }),
  ]) {
    await screen
      .getByLabelText("Backup file")
      .upload(new File([text], "bad.json"));
    await expect
      .element(screen.getByText("Backup could not be read", { exact: true }))
      .toBeVisible();
    expect(save.mock.calls.every(([snapshot]) => snapshot === initial)).toBe(
      true,
    );
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  }
});

test("a delayed failed restore keeps the current workspace and blocks edits during the save", async () => {
  const initial = emptyWorkspace("UTC");
  let rejectSave: (cause: Error) => void = () => {};
  const source: WorkspaceDataSource = {
    owner: { kind: "account", userId: "failed-restore" },
    load: () => initial,
    save: (snapshot) =>
      snapshot.tasks.length
        ? new Promise<void>((_resolve, reject) => {
            rejectSave = reject;
          })
        : undefined,
  };
  const screen = await render(
    <WorkspaceProvider dataSource={source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await expect
    .element(
      screen.getByRole("button", { name: "Restore backup", exact: true }),
    )
    .toBeEnabled();
  await screen.getByLabelText("Backup file").upload(backupFile());
  await screen
    .getByRole("dialog")
    .getByRole("button", { name: "Restore backup", exact: true })
    .click();
  await expect
    .element(
      screen.getByRole("button", { name: "Restore backup", exact: true }),
    )
    .toBeDisabled();
  await expect.element(screen.getByTestId("tasks")).toHaveTextContent("0");
  rejectSave(new Error("Save unavailable"));
  await expect
    .element(
      screen.getByRole("region", { name: "Your workspace", exact: true }),
    )
    .toMatchTextContent("Save unavailable");
  await expect.element(screen.getByTestId("tasks")).toHaveTextContent("0");
});
