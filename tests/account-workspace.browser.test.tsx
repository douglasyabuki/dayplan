import "@/app/globals.css";

import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import { WorkspaceFeedback } from "@/components/workspace/workspace-feedback";
import { emptyWorkspace } from "@/lib/workspace/empty";
import { seedWorkspace } from "@/lib/workspace/seed";
import { accountDataSources } from "@/stores/workspace/account-data-source";
import { STORAGE_KEY } from "@/stores/workspace/persistence";
import { useWorkspace, WorkspaceProvider } from "@/stores/workspace/provider";
import { validateWorkspace } from "@/stores/workspace/validation";
import type { Workspace } from "@/types-and-constants/workspace";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function Harness() {
  const workspace = useWorkspace();
  if (!workspace.ready) return <p>Loading account</p>;
  return (
    <>
      <p data-testid="theme">{workspace.state.theme}</p>
      <p data-testid="tasks">{workspace.state.tasks.length}</p>
      <button onClick={() => workspace.act({ type: "theme", theme: "dark" })}>
        Set dark
      </button>
      <WorkspaceFeedback />
    </>
  );
}

test("conflict backup preserves current edits; Cancel keeps them and confirmed reload fetches server state", async () => {
  const originalFetch = globalThis.fetch;
  let reads = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input) !== "/api/workspace") return originalFetch(input, init);
    if (init?.method === "PUT")
      return Response.json(
        { code: "revision_conflict", message: "A newer workspace was saved." },
        { status: 409 },
      );
    reads++;
    return Response.json({
      snapshot: {
        ...emptyWorkspace(),
        theme: reads === 1 ? "system" : "light",
      },
      revision: reads,
    });
  });
  let backup: Blob | undefined;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    backup = blob as Blob;
    return "blob:backup";
  });
  const download = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  const source = accountDataSources(crypto.randomUUID(), "session").workspace;
  const screen = await render(
    <WorkspaceProvider dataSource={source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await screen.getByRole("button", { name: "Set dark" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Load server version" }))
    .toBeVisible();
  await screen.getByRole("button", { name: "Download local backup" }).click();
  expect(download).toHaveBeenCalledOnce();
  expect(validateWorkspace(JSON.parse(await backup!.text())).theme).toBe(
    "dark",
  );
  await screen.getByRole("button", { name: "Load server version" }).click();
  await expect
    .element(screen.getByRole("dialog"))
    .toHaveTextContent("discards unsaved local edits");
  await screen.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("dark");
  expect(reads).toBe(1);
  await screen.getByRole("button", { name: "Load server version" }).click();
  await screen.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("light");
});

test("changed guest import warns before submission; lost response recovery adopts latest state and retains guest storage", async () => {
  const guest = seedWorkspace();
  const rawGuest = JSON.stringify(guest);
  localStorage.setItem(STORAGE_KEY, rawGuest);
  const latest: Workspace = { ...guest, theme: "dark" };
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input);
    if (path === "/api/workspace/import/preview")
      return Response.json({
        historyToken: "history",
        hasPriorImports: true,
        alreadyImported: false,
      });
    if (path === "/api/workspace/import") {
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length === 1)
        throw new TypeError("Lost response after commit");
      return Response.json({ snapshot: latest, revision: 7 });
    }
    if (path === "/api/workspace")
      return Response.json({ snapshot: emptyWorkspace(), revision: 1 });
    return originalFetch(input, init);
  });
  const source = accountDataSources(crypto.randomUUID(), "session").workspace;
  const screen = await render(
    <WorkspaceProvider dataSource={source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await screen.getByRole("button", { name: "Import guest data" }).click();
  await expect
    .element(screen.getByRole("dialog"))
    .toHaveTextContent("including items imported before");
  expect(bodies).toHaveLength(0);
  await screen.getByRole("button", { name: "Confirm import" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Retry import" }))
    .toBeVisible();
  await screen.getByRole("button", { name: "Set dark" }).click();
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("system");
  await screen.getByRole("button", { name: "Retry import" }).click();
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("dark");
  await expect
    .element(screen.getByTestId("tasks"))
    .toHaveTextContent(String(guest.tasks.length));
  expect(bodies[1]).toEqual(bodies[0]);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(rawGuest);
});
