import "@/app/globals.css";

import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import { DataPanel } from "@/components/settings/data-panel";
import { WorkspaceFeedback } from "@/components/workspace/workspace-feedback";
import { emptyWorkspace } from "@/lib/workspace/empty";
import { mergeGuestWorkspace } from "@/lib/workspace/import";
import { seedWorkspace } from "@/lib/workspace/seed";
import { GUEST_PROFILE_KEY, LEGACY_KEY } from "@/stores/account/persistence";
import { accountDataSources } from "@/stores/workspace/account-data-source";
import {
  readGuestData,
  sameGuestWorkspace,
  writeGuestCleanup,
} from "@/stores/workspace/guest-data";
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
  const [settings, setSettings] = useState(false);
  if (!workspace.ready) return <p>Loading account</p>;
  return (
    <>
      <p data-testid="theme">{workspace.state.theme}</p>
      <p data-testid="tasks">{workspace.state.tasks.length}</p>
      <button onClick={() => workspace.act({ type: "theme", theme: "dark" })}>
        Set dark
      </button>
      <WorkspaceFeedback />
      <button onClick={() => setSettings((open) => !open)}>
        Data settings
      </button>
      {settings && (
        <div data-testid="data-settings">
          <DataPanel onReset={workspace.reset} onClear={workspace.clearData} />
        </div>
      )}
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

test("changed guest import warns before submission; lost response recovery adopts latest state and removes guest storage", async () => {
  const guest = seedWorkspace();
  const rawGuest = JSON.stringify(guest);
  localStorage.setItem(STORAGE_KEY, rawGuest);
  localStorage.setItem(
    GUEST_PROFILE_KEY,
    JSON.stringify({ name: "Guest identity" }),
  );
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
  expect(localStorage.getItem(STORAGE_KEY)).toBe(rawGuest);
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).toContain("Guest identity");
  await screen.getByRole("button", { name: "Set dark" }).click();
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("system");
  await screen.getByRole("button", { name: "Retry import" }).click();
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("dark");
  await expect
    .element(screen.getByTestId("tasks"))
    .toHaveTextContent(String(guest.tasks.length));
  expect(bodies[1]).toEqual(bodies[0]);
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).toBeNull();
});

function guestFixture() {
  const guest = seedWorkspace();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(guest));
  localStorage.setItem(
    GUEST_PROFILE_KEY,
    JSON.stringify({ name: "Guest identity" }),
  );
  localStorage.setItem(LEGACY_KEY, JSON.stringify({ name: "Legacy identity" }));
  return guest;
}

function mockImportApi() {
  let account = { ...seedWorkspace(), theme: "light" as Workspace["theme"] };
  const before = structuredClone(account);
  const receipts: Workspace[] = [];
  let revision = 1;
  let imports = 0;
  const originalFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input);
    if (path === "/api/workspace/import/preview") {
      const { snapshot } = JSON.parse(String(init?.body));
      return Response.json({
        historyToken: "history",
        hasPriorImports: false,
        alreadyImported: receipts.some((guest) =>
          sameGuestWorkspace(guest, snapshot),
        ),
      });
    }
    if (path === "/api/workspace/import") {
      imports++;
      const { snapshot } = JSON.parse(String(init?.body));
      if (!receipts.some((guest) => sameGuestWorkspace(guest, snapshot))) {
        receipts.push(snapshot);
        account = mergeGuestWorkspace(account, snapshot, () =>
          crypto.randomUUID(),
        );
        revision++;
      }
      return Response.json({ snapshot: account, revision });
    }
    if (path === "/api/workspace") {
      if (init?.method === "PUT") {
        account = JSON.parse(String(init.body)).snapshot;
        revision++;
        return Response.json({
          committedRevision: revision,
          currentRevision: revision,
        });
      }
      return Response.json({ snapshot: account, revision });
    }
    return originalFetch(input, init);
  });
  return { before, receipts, imports: () => imports, account: () => account };
}

function accountView(userId = crypto.randomUUID()) {
  const source = accountDataSources(userId, "session").workspace;
  return (
    <WorkspaceProvider dataSource={source}>
      <Harness />
    </WorkspaceProvider>
  );
}

test("successful import cleans guest workspace and profile, preserves account items, and stays resolved after reopening", async () => {
  const guest = guestFixture();
  const api = mockImportApi();
  const view = accountView();
  const screen = await render(view);
  await screen
    .getByRole("button", { name: "Import guest data", exact: true })
    .click();
  await expect
    .element(screen.getByRole("dialog"))
    .toHaveTextContent("guest profile name will be deleted from this browser");
  await screen.getByRole("button", { name: "Confirm import" }).click();
  await expect
    .element(screen.getByTestId("tasks"))
    .toHaveTextContent(String(api.before.tasks.length + guest.tasks.length));
  expect(api.account().tasks.slice(0, api.before.tasks.length)).toEqual(
    api.before.tasks,
  );
  expect(api.account().theme).toBe(api.before.theme);
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).toBeNull();
  expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  await screen.getByRole("button", { name: "Data settings" }).click();
  await expect
    .element(screen.getByTestId("data-settings"))
    .not.toHaveTextContent("Guest data available");
  await screen.unmount();
  const reopened = await render(view);
  await expect
    .element(reopened.getByTestId("theme"))
    .toHaveTextContent("light");
  await expect.element(reopened.getByRole("dialog")).not.toBeInTheDocument();
  expect(api.imports()).toBe(1);
});

test("cancelling import or discard and closing startup preserve data; confirmed discard resolves both surfaces and reopening", async () => {
  guestFixture();
  const target = readGuestData();
  const api = mockImportApi();
  const view = accountView();
  const screen = await render(view);
  await screen
    .getByRole("button", { name: "Import guest data", exact: true })
    .click();
  await screen.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(readGuestData()).toEqual(target);
  await screen
    .getByRole("button", { name: "Discard guest data", exact: true })
    .click();
  await expect
    .element(screen.getByRole("dialog"))
    .toHaveTextContent(
      "Permanently delete the guest workspace and guest profile name from this browser? Your account data will be kept.",
    );
  await screen.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(readGuestData()).toEqual(target);
  await screen.getByRole("button", { name: "Close", exact: true }).click();
  expect(readGuestData()).toEqual(target);
  await screen.unmount();
  const reopened = await render(view);
  await expect
    .element(reopened.getByRole("dialog"))
    .toHaveTextContent("Guest data available");
  await reopened
    .getByRole("button", { name: "Discard guest data", exact: true })
    .click();
  await reopened.getByRole("button", { name: "Confirm discard" }).click();
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).toBeNull();
  expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  expect(api.account()).toEqual(api.before);
  expect(api.imports()).toBe(0);
  await reopened.getByRole("button", { name: "Data settings" }).click();
  await expect
    .element(reopened.getByTestId("data-settings"))
    .not.toHaveTextContent("Guest data available");
  await reopened.unmount();
  const resolved = await render(view);
  await expect
    .element(resolved.getByTestId("theme"))
    .toHaveTextContent("light");
  await expect.element(resolved.getByRole("dialog")).not.toBeInTheDocument();
});

test("cleanup failure offers local-only retry and keeps the confirmed account import usable", async () => {
  const guest = guestFixture();
  const api = mockImportApi();
  const screen = await render(accountView());
  await screen
    .getByRole("button", { name: "Import guest data", exact: true })
    .click();
  const remove = vi.spyOn(Storage.prototype, "removeItem");
  remove.mockImplementationOnce(() => {
    throw new Error("Denied");
  });
  await screen.getByRole("button", { name: "Confirm import" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Retry cleanup" }))
    .toBeVisible();
  await expect
    .element(screen.getByTestId("tasks"))
    .toHaveTextContent(String(api.before.tasks.length + guest.tasks.length));
  expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  await screen.getByRole("button", { name: "Set dark" }).click();
  await expect.element(screen.getByTestId("theme")).toHaveTextContent("dark");
  await screen.getByRole("button", { name: "Retry cleanup" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Retry cleanup" }))
    .not.toBeInTheDocument();
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(api.imports()).toBe(1);
});

test("fresh-page receipt recovery removes captured profiles and preserves newer guest workspace and name", async () => {
  const guest = guestFixture();
  const userId = crypto.randomUUID();
  writeGuestCleanup(userId, {
    target: readGuestData(),
    confirmed: false,
    operation: {
      snapshot: guest,
      expectedRevision: 1,
      confirmedHistoryToken: "history",
    },
  });
  const newer = { ...guest, theme: "dark" as const };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newer));
  localStorage.setItem(
    GUEST_PROFILE_KEY,
    JSON.stringify({ name: "New guest identity" }),
  );
  const api = mockImportApi();
  api.receipts.push(guest);
  const screen = await render(accountView(userId));
  await expect
    .element(screen.getByRole("dialog"))
    .toHaveTextContent("Guest data available");
  expect(readGuestData().snapshot).toEqual(newer);
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).toContain(
    "New guest identity",
  );
  expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  expect(api.imports()).toBe(0);
});

test("changed guest data requires renewed import or discard confirmation", async () => {
  const guest = guestFixture();
  const api = mockImportApi();
  const screen = await render(accountView());
  await screen
    .getByRole("button", { name: "Import guest data", exact: true })
    .click();
  const newer = { ...guest, theme: "dark" as const };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newer));
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  await screen.getByRole("button", { name: "Confirm import" }).click();
  await expect
    .element(
      screen.getByText(
        "Guest data changed. Review and confirm the import again.",
      ),
    )
    .toBeVisible();
  expect(api.imports()).toBe(0);
  await screen
    .getByRole("button", { name: "Discard guest data", exact: true })
    .click();
  localStorage.setItem(
    GUEST_PROFILE_KEY,
    JSON.stringify({ name: "New guest identity" }),
  );
  await screen.getByRole("button", { name: "Confirm discard" }).click();
  await expect
    .element(
      screen.getByText(
        "Guest data changed. Review it and confirm discarding again.",
      ),
    )
    .toBeVisible();
  expect(readGuestData().snapshot).toEqual(newer);
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).toContain(
    "New guest identity",
  );
});

test("Data settings refreshes guest availability on storage events and window focus", async () => {
  mockImportApi();
  const screen = await render(accountView());
  await screen.getByRole("button", { name: "Data settings" }).click();
  await expect
    .element(screen.getByTestId("data-settings"))
    .not.toHaveTextContent("Guest data available");
  guestFixture();
  window.dispatchEvent(new Event("focus"));
  await expect
    .element(screen.getByTestId("data-settings"))
    .toHaveTextContent("Guest data available");
  await screen.getByRole("button", { name: "Close", exact: true }).click();
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  await expect
    .element(screen.getByTestId("data-settings"))
    .not.toHaveTextContent("Guest data available");
});
