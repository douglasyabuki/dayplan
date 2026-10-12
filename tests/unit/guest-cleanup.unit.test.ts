import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { emptyWorkspace } from "@/lib/workspace/empty";
import { seedWorkspace } from "@/lib/workspace/seed";
import { GUEST_PROFILE_KEY, LEGACY_KEY } from "@/stores/account/persistence";
import { accountDataSources } from "@/stores/workspace/account-data-source";
import {
  cleanupGuestData,
  discardGuestData,
  guestCleanupKey,
  readGuestCleanup,
  readGuestData,
  writeGuestCleanup,
} from "@/stores/workspace/guest-data";
import { STORAGE_KEY } from "@/stores/workspace/persistence";

import { mockGuestStorage } from "../guest-storage";

let storage: ReturnType<typeof mockGuestStorage>;
beforeEach(() => {
  storage = mockGuestStorage();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function seedGuest() {
  const guest = seedWorkspace();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(guest));
  localStorage.setItem(
    GUEST_PROFILE_KEY,
    JSON.stringify({ name: "Guest name" }),
  );
  localStorage.setItem(LEGACY_KEY, JSON.stringify({ name: "Old guest name" }));
  return guest;
}

function api() {
  const account = { ...emptyWorkspace(), theme: "dark" as const };
  const fetcher = vi.fn(async (path: string, options?: RequestInit) => {
    void options;
    if (path === "/api/workspace/import/preview") {
      return Response.json({
        historyToken: "history",
        alreadyImported: false,
        hasPriorImports: false,
      });
    }
    return Response.json({ snapshot: account, revision: 3 });
  });
  vi.stubGlobal("fetch", fetcher);
  return { account, fetcher };
}

test("confirmed import deletes workspace and both captured profiles, preserving account state and unrelated keys", async () => {
  const guest = seedGuest();
  localStorage.setItem("dayplan.onboarding", "complete");
  const { account } = api();
  const userId = crypto.randomUUID();
  const source = accountDataSources(userId, "session").workspace;
  const signal = new AbortController().signal;
  await source.load(signal);
  expect(await source.importGuest(guest, "history", signal)).toEqual(account);
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).toBeNull();
  expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  expect(localStorage.getItem(guestCleanupKey(userId))).toBeNull();
  expect(localStorage.getItem("dayplan.onboarding")).toBe("complete");
  expect(source.guestCleanupError).toBe("");
});

test("network and invalid account responses preserve every guest deletion target", async () => {
  const guest = seedGuest();
  const before = readGuestData();
  const { fetcher } = api();
  const source = accountDataSources(crypto.randomUUID(), "session").workspace;
  const signal = new AbortController().signal;
  await source.load(signal);
  fetcher.mockRejectedValueOnce(new TypeError("Lost response"));
  await expect(source.importGuest(guest, "history", signal)).rejects.toThrow();
  expect(readGuestData()).toEqual(before);
  expect(source.hasPendingImport).toBe(true);
  fetcher.mockResolvedValueOnce(
    Response.json({ snapshot: { version: 2 }, revision: 4 }),
  );
  await expect(source.retryImport(signal)).rejects.toThrow();
  expect(readGuestData()).toEqual(before);
  expect(source.hasPendingImport).toBe(true);
});

test("successful retry and returning-owner recovery delete profiles using original values", async () => {
  const guest = seedGuest();
  const { fetcher, account } = api();
  const userId = crypto.randomUUID();
  const source = accountDataSources(userId, "session").workspace;
  const signal = new AbortController().signal;
  await source.load(signal);
  fetcher.mockRejectedValueOnce(new TypeError("Lost response"));
  await expect(source.importGuest(guest, "history", signal)).rejects.toThrow();
  const firstBody = fetcher.mock.calls.at(-1);
  localStorage.setItem(
    GUEST_PROFILE_KEY,
    JSON.stringify({ name: "Newer name" }),
  );
  const returning = accountDataSources(userId, "new-session").workspace;
  expect(await returning.load(signal)).toEqual(account);
  expect(fetcher.mock.calls.at(-1)?.[1]?.body).toEqual(firstBody?.[1]?.body);
  expect(fetcher.mock.calls.at(-1)?.[1]?.headers).toMatchObject({
    "X-Dayplan-Session": "new-session",
  });
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).toContain("Newer name");
  expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
});

test("fresh source receipt recovery uses durable targets, even if workspace was removed during partial cleanup", async () => {
  const guest = seedGuest();
  const target = readGuestData();
  const userId = crypto.randomUUID();
  writeGuestCleanup(userId, {
    target,
    operation: {
      snapshot: guest,
      expectedRevision: 1,
      confirmedHistoryToken: "history",
    },
    confirmed: false,
  });
  localStorage.removeItem(STORAGE_KEY);
  localStorage.setItem(
    GUEST_PROFILE_KEY,
    JSON.stringify({ name: "Newer name" }),
  );
  const { fetcher } = api();
  fetcher.mockImplementation(async (path) =>
    path === "/api/workspace/import/preview"
      ? Response.json({
          historyToken: "history",
          alreadyImported: true,
          hasPriorImports: false,
        })
      : Response.json({ snapshot: emptyWorkspace(), revision: 4 }),
  );
  const source = accountDataSources(userId, "new-session").workspace;
  await source.load(new AbortController().signal);
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).toContain("Newer name");
  expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  expect(localStorage.getItem(guestCleanupKey(userId))).toBeNull();
  expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
    "/api/workspace",
    "/api/workspace/import/preview",
    "/api/workspace",
  ]);
});

test("historical receipt recovery cleans workspace and preserves uncaptured guest profile", async () => {
  seedGuest();
  const { fetcher } = api();
  fetcher.mockImplementation(async (path) =>
    path === "/api/workspace/import/preview"
      ? Response.json({
          historyToken: "history",
          alreadyImported: true,
          hasPriorImports: false,
        })
      : Response.json({ snapshot: emptyWorkspace(), revision: 4 }),
  );
  const source = accountDataSources(crypto.randomUUID(), "session").workspace;
  await source.load(new AbortController().signal);
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).toContain("Guest name");
  expect(localStorage.getItem(LEGACY_KEY)).toContain("Old guest name");
});

test("unresolved durable import prevents new imports and edits until safely retried", async () => {
  const guest = seedGuest();
  const userId = crypto.randomUUID();
  writeGuestCleanup(userId, {
    target: readGuestData(),
    operation: {
      snapshot: guest,
      expectedRevision: 1,
      confirmedHistoryToken: "history",
    },
    confirmed: false,
  });
  const { fetcher } = api();
  const source = accountDataSources(userId, "session").workspace;
  const signal = new AbortController().signal;
  await expect(source.load(signal)).rejects.toMatchObject({
    code: "import_pending",
  });
  expect(source.hasPendingImport).toBe(true);
  await expect(source.save(emptyWorkspace(), signal)).rejects.toMatchObject({
    code: "import_pending",
  });
  await source.retryImport(signal);
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(
    fetcher.mock.calls.filter(([path]) => path === "/api/workspace/import"),
  ).toHaveLength(1);
});

test("newer workspace and profiles survive confirmed import", async () => {
  const guest = seedGuest();
  const target = readGuestData();
  const { fetcher } = api();
  const source = accountDataSources(crypto.randomUUID(), "session").workspace;
  const signal = new AbortController().signal;
  await source.load(signal);
  const newer = { ...guest, theme: "light" as const };
  fetcher.mockImplementationOnce(async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newer));
    localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify({ name: "New" }));
    return Response.json({ snapshot: emptyWorkspace(), revision: 4 });
  });
  await source.importGuest(guest, "history", signal, target);
  expect(readGuestData().snapshot).toEqual(newer);
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).toContain("New");
  expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
});

test("cleanup failure keeps account usable and local-only retry never repeats import", async () => {
  const guest = seedGuest();
  const { fetcher, account } = api();
  const userId = crypto.randomUUID();
  const source = accountDataSources(userId, "session").workspace;
  const signal = new AbortController().signal;
  await source.load(signal);
  storage.removeItem.mockImplementationOnce(() => {
    throw new Error("Denied");
  });
  expect(await source.importGuest(guest, "history", signal)).toEqual(account);
  expect(source.guestCleanupError).toContain("could not be completely deleted");
  expect(source.hasPendingImport).toBe(false);
  expect(source.hasPendingGuestCleanup).toBe(true);
  expect(readGuestCleanup(userId)?.confirmed).toBe(true);
  const count = fetcher.mock.calls.length;
  await source.save(account, signal);
  source.retryGuestCleanup();
  expect(fetcher.mock.calls.length).toBe(count);
  expect(source.guestCleanupError).toBe("");
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});

test("metadata write failure prevents any import request and preserves guest data", async () => {
  const guest = seedGuest();
  const target = readGuestData();
  const { fetcher } = api();
  const source = accountDataSources(crypto.randomUUID(), "session").workspace;
  const signal = new AbortController().signal;
  await source.load(signal);
  storage.setItem.mockImplementationOnce(() => {
    throw new Error("Quota");
  });
  await expect(
    source.importGuest(guest, "history", signal),
  ).rejects.toMatchObject({ code: "guest_metadata_failed" });
  expect(readGuestData()).toEqual(target);
  expect(source.hasPendingImport).toBe(false);
  expect(
    fetcher.mock.calls.some(([path]) => path === "/api/workspace/import"),
  ).toBe(false);
});

test("discard detects changed workspace or profile before deleting anything", () => {
  seedGuest();
  const target = readGuestData();
  localStorage.setItem(LEGACY_KEY, JSON.stringify({ name: "Changed" }));
  expect(discardGuestData(target).error).toContain("changed");
  expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).not.toBeNull();
  const fresh = readGuestData();
  expect(discardGuestData(fresh)).toEqual({ error: "", changed: false });
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).toBeNull();
  expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
});

test("cleanup verifies removals and preserves unreadable workspace", () => {
  seedGuest();
  const target = readGuestData();
  storage.removeItem.mockImplementationOnce(() => {});
  expect(cleanupGuestData(target).error).not.toBe("");
  localStorage.setItem(STORAGE_KEY, "unreadable");
  expect(cleanupGuestData(target).error).not.toBe("");
  expect(localStorage.getItem(STORAGE_KEY)).toBe("unreadable");
});

test("partial confirmed discard is recovered after reopening without touching account data", async () => {
  seedGuest();
  const userId = crypto.randomUUID();
  const { account, fetcher } = api();
  const source = accountDataSources(userId, "session").workspace;
  const signal = new AbortController().signal;
  await source.load(signal);
  const remove = storage.removeItem.getMockImplementation()!;
  storage.removeItem.mockImplementation((key) => {
    if (key === GUEST_PROFILE_KEY) throw new Error("Denied");
    remove(key);
  });
  expect(source.discardGuest(readGuestData())).toBe(false);
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).not.toBeNull();
  expect(readGuestCleanup(userId)?.confirmed).toBe(true);
  storage.removeItem.mockImplementation(remove);
  const { AccountWorkspaceDataSource } =
    await import("@/stores/workspace/account-data-source");
  const fresh = new AccountWorkspaceDataSource({
    owner: { kind: "account", userId },
    sessionId: "new-session",
    request: async <T>() => ({ snapshot: account, revision: 3 }) as T,
  });
  expect(await fresh.load(signal)).toEqual(account);
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).toBeNull();
  expect(localStorage.getItem(guestCleanupKey(userId))).toBeNull();
  expect(
    fetcher.mock.calls.some(([path]) => path === "/api/workspace/import"),
  ).toBe(false);
});

test("unreadable recovery metadata is preserved and prevents a competing new import", async () => {
  const guest = seedGuest();
  const before = readGuestData();
  const userId = crypto.randomUUID();
  const key = guestCleanupKey(userId);
  localStorage.setItem(key, "unreadable");
  const { fetcher } = api();
  const source = accountDataSources(userId, "session").workspace;
  const signal = new AbortController().signal;
  await source.load(signal);
  await expect(
    source.importGuest(guest, "history", signal),
  ).rejects.toMatchObject({ code: "guest_recovery_pending" });
  expect(readGuestData()).toEqual(before);
  expect(localStorage.getItem(key)).toBe("unreadable");
  expect(
    fetcher.mock.calls.some(([path]) => path === "/api/workspace/import"),
  ).toBe(false);
});

test("fresh receipt recovery reloads the latest account before cleanup", async () => {
  const guest = seedGuest();
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
  const { fetcher } = api();
  let reads = 0;
  const latest = { ...guest, theme: "dark" as const };
  fetcher.mockImplementation(async (path) =>
    path === "/api/workspace/import/preview"
      ? Response.json({
          alreadyImported: true,
          historyToken: "history",
          hasPriorImports: false,
        })
      : Response.json({
          snapshot: ++reads === 1 ? emptyWorkspace() : latest,
          revision: reads,
        }),
  );
  const source = accountDataSources(userId, "new-session").workspace;
  expect(await source.load(new AbortController().signal)).toEqual(latest);
  expect(reads).toBe(2);
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(GUEST_PROFILE_KEY)).toBeNull();
});

test("lost startup receipt response preserves targets and pending recovery", async () => {
  const guest = seedGuest();
  const target = readGuestData();
  const userId = crypto.randomUUID();
  writeGuestCleanup(userId, {
    target,
    confirmed: false,
    operation: {
      snapshot: guest,
      expectedRevision: 1,
      confirmedHistoryToken: "history",
    },
  });
  const { fetcher } = api();
  fetcher.mockImplementation(async (path) => {
    if (path === "/api/workspace/import/preview")
      throw new TypeError("Offline");
    return Response.json({ snapshot: emptyWorkspace(), revision: 1 });
  });
  const source = accountDataSources(userId, "new-session").workspace;
  await expect(source.load(new AbortController().signal)).rejects.toMatchObject(
    { code: "network_error" },
  );
  expect(readGuestData()).toEqual(target);
  expect(source.hasPendingImport).toBe(true);
});
