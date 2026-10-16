import "@/app/globals.css";

import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import { emptyWorkspace } from "@/lib/workspace/empty";
import {
  beginAccountDeletion,
  checkAccountDeletion,
  checkAccountDeletionEligibility,
  cleanupDeletedAccount,
} from "@/stores/session/account-deletion";
import {
  cancelDeletion,
  readDeletion,
  writeDeletion,
} from "@/stores/session/deletion-state";
import { accountDataSources } from "@/stores/workspace/account-data-source";
import { guestCleanupKey } from "@/stores/workspace/guest-data";
import { STORAGE_KEY } from "@/stores/workspace/persistence";
import { useWorkspace, WorkspaceProvider } from "@/stores/workspace/provider";
import {
  listRecovery,
  readRecovery,
  type RecoveryRecord,
  writeRecovery,
} from "@/stores/workspace/recovery-journal";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

function record(
  userId: string,
  writerId = crypto.randomUUID(),
): RecoveryRecord {
  return {
    version: 1,
    userId,
    writerId,
    sequence: 1,
    generation: 1,
    baseRevision: 0,
    latest: { ...emptyWorkspace(), theme: "dark" },
    operation: null,
  };
}

test("confirmed deletion purges every account writer and preserves guest and other-user storage", async () => {
  const userId = crypto.randomUUID();
  const other = record(crypto.randomUUID());
  const signal = new AbortController().signal;
  const first = record(userId);
  const second = record(userId);
  await writeRecovery(first, 0, signal);
  await writeRecovery(second, 0, signal);
  await writeRecovery(other, 0, signal);
  localStorage.setItem(STORAGE_KEY, "independent guest bytes");
  localStorage.setItem("dayplan.guest-profile.v1", "independent guest profile");
  localStorage.setItem(guestCleanupKey(userId), "account import metadata");
  localStorage.setItem(guestCleanupKey(other.userId), "other import metadata");
  writeDeletion(userId, {
    state: "deleted",
    capability: "signed-status",
    attempt: "a",
  });
  await cleanupDeletedAccount(userId);
  expect(await listRecovery(userId, signal)).toEqual([]);
  expect(await readRecovery(other.userId, other.writerId, signal)).toEqual(
    other,
  );
  expect(localStorage.getItem(STORAGE_KEY)).toBe("independent guest bytes");
  expect(localStorage.getItem("dayplan.guest-profile.v1")).toBe(
    "independent guest profile",
  );
  expect(localStorage.getItem(guestCleanupKey(userId))).toBeNull();
  expect(localStorage.getItem(guestCleanupKey(other.userId))).toBe(
    "other import metadata",
  );
  expect(readDeletion(userId)?.state).toBe("clean");
  await expect(
    writeRecovery({ ...first, sequence: 2 }, 1, signal),
  ).rejects.toThrow("paused");
});

test("failed browser cleanup retains a retry marker and recovery until an explicit retry succeeds", async () => {
  const stored = record(crypto.randomUUID());
  const signal = new AbortController().signal;
  await writeRecovery(stored, 0, signal);
  writeDeletion(stored.userId, {
    state: "deleted",
    capability: "signed-status",
    attempt: "cleanup",
  });
  const open = vi.spyOn(indexedDB, "open").mockImplementation(() => {
    throw new Error("storage unavailable");
  });
  await expect(cleanupDeletedAccount(stored.userId)).rejects.toThrow();
  expect(readDeletion(stored.userId)?.state).toBe("deleted");
  open.mockRestore();
  expect(await readRecovery(stored.userId, stored.writerId, signal)).toEqual(
    stored,
  );
  await cleanupDeletedAccount(stored.userId);
  expect(await listRecovery(stored.userId, signal)).toEqual([]);
});

test("eligibility success and failure do not create recovery markers or pause edits", async () => {
  const userId = crypto.randomUUID();
  const fetch = vi.spyOn(globalThis, "fetch");
  fetch.mockResolvedValueOnce(Response.json({ eligible: true }));
  await checkAccountDeletionEligibility("session-a");
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
    checkOnly: true,
  });
  expect(readDeletion(userId)).toBeNull();
  fetch.mockResolvedValueOnce(
    Response.json(
      { code: "unauthorized", message: "Sign in again" },
      { status: 401 },
    ),
  );
  await expect(
    checkAccountDeletionEligibility("session-a"),
  ).rejects.toMatchObject({ code: "unauthorized" });
  expect(readDeletion(userId)).toBeNull();
  fetch.mockResolvedValueOnce(Response.json({}));
  await expect(checkAccountDeletionEligibility("session-a")).rejects.toThrow(
    "eligibility",
  );
  expect(readDeletion(userId)).toBeNull();
});

test("lost deletion response keeps edits paused until status checking cancels the server intent", async () => {
  const userId = crypto.randomUUID();
  const methods: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    methods.push(init?.method ?? "GET");
    if (init?.method === "POST")
      return Response.json({ capability: "signed-status" });
    if (init?.method === "DELETE") throw new Error("response lost");
    return Response.json({ deleted: false });
  });
  await beginAccountDeletion(userId, "session-a");
  expect(readDeletion(userId)?.state).toBe("unknown");
  await checkAccountDeletion(userId);
  expect(readDeletion(userId)).toBeNull();
  expect(methods).toEqual(["POST", "DELETE", "PATCH"]);
});

test("expiry rejected by DELETE clears its marker and preserves recovery for a safe retry", async () => {
  const stored = record(crypto.randomUUID());
  const signal = new AbortController().signal;
  await writeRecovery(stored, 0, signal);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    if (init?.method === "POST")
      return Response.json({ capability: "signed-status" });
    return Response.json(
      { code: "unauthorized", message: "Sign in again" },
      { status: 401 },
    );
  });
  await expect(
    beginAccountDeletion(stored.userId, "expired-session"),
  ).rejects.toMatchObject({ code: "unauthorized" });
  expect(readDeletion(stored.userId)).toBeNull();
  expect(await readRecovery(stored.userId, stored.writerId, signal)).toEqual(
    stored,
  );
  await writeRecovery({ ...stored, sequence: 2 }, 1, signal);
});

function Harness() {
  const workspace = useWorkspace();
  return (
    <>
      <p>{workspace.ready ? workspace.state.theme : "Loading"}</p>
      <p>
        {workspace.deletionPaused ? "Deletion paused" : workspace.syncStatus}
      </p>
      <button onClick={() => workspace.act({ type: "theme", theme: "dark" })}>
        Edit
      </button>
      <button onClick={workspace.retrySave}>Retry</button>
    </>
  );
}

test("another tab's deletion marker stops queued saves and mutations; cancellation recovers staged edits", async () => {
  const userId = crypto.randomUUID();
  const writes = vi.fn();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input) === "/api/workspace") {
      if (init?.method === "PUT") {
        writes();
        return Response.json({ committedRevision: 1, currentRevision: 1 });
      }
      return Response.json({ snapshot: emptyWorkspace(), revision: 0 });
    }
    return Response.json({ alreadyImported: false });
  });
  const source = accountDataSources(userId, "session").workspace;
  const screen = await render(
    <WorkspaceProvider dataSource={source}>
      <Harness />
    </WorkspaceProvider>,
  );
  await expect
    .element(screen.getByText("system", { exact: true }))
    .toBeVisible();
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await expect
    .element(screen.getByText("Pending", { exact: true }))
    .toBeVisible();
  await expect
    .poll(
      async () =>
        (await listRecovery(userId, new AbortController().signal)).length,
    )
    .toBe(1);
  const marker = {
    state: "pending" as const,
    capability: "signed-status",
    attempt: "other-tab",
  };
  localStorage.setItem(
    `dayplan.account-deletion.v1:${encodeURIComponent(userId)}`,
    JSON.stringify(marker),
  );
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: `dayplan.account-deletion.v1:${encodeURIComponent(userId)}`,
    }),
  );
  await expect.element(screen.getByText("Deletion paused")).toBeVisible();
  await screen.getByRole("button", { name: "Retry", exact: true }).click();
  expect(writes).not.toHaveBeenCalled();
  await expect(async () =>
    source.stage(emptyWorkspace(), new AbortController().signal),
  ).rejects.toThrow("paused");
  cancelDeletion(userId, marker.attempt);
  await expect.element(screen.getByText("dark", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByText("Saved", { exact: true }))
    .toBeVisible();
  expect(writes).toHaveBeenCalledOnce();
});

test("malformed status responses cannot resume an uncertain deletion", async () => {
  const userId = crypto.randomUUID();
  writeDeletion(userId, {
    state: "unknown",
    capability: "signed-status",
    attempt: "malformed",
  });
  const fetch = vi.spyOn(globalThis, "fetch");
  for (const body of [{}, { deleted: "false" }, { deleted: 1 }]) {
    fetch.mockResolvedValueOnce(Response.json(body));
    await expect(checkAccountDeletion(userId)).rejects.toThrow(
      "could not be confirmed",
    );
    expect(readDeletion(userId)?.state).toBe("unknown");
  }
});
