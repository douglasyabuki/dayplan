import { afterEach, expect, test, vi } from "vitest";

import { emptyWorkspace } from "@/lib/workspace/empty";
import { seedWorkspace } from "@/lib/workspace/seed";
import { accountDataSources } from "@/stores/workspace/account-data-source";

afterEach(() => vi.unstubAllGlobals());

test("a lost save response is retried with the same ID and body before newer local edits", async () => {
  const bodies: Record<string, unknown>[] = [];
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, options) => {
      if (!options.body)
        return Response.json({ snapshot: emptyWorkspace(), revision: 1 });
      bodies.push(JSON.parse(options.body));
      writes += 1;
      if (writes === 1) throw new TypeError("Lost response after commit");
      return Response.json({
        committedRevision: writes === 2 ? 2 : 3,
        currentRevision: writes === 2 ? 2 : 3,
      });
    }),
  );
  const source = accountDataSources(crypto.randomUUID(), "session-a").workspace;
  const signal = new AbortController().signal;
  await source.load(signal);
  const first = { ...emptyWorkspace(), theme: "dark" as const };
  await expect(source.save(first, signal)).rejects.toMatchObject({
    code: "network_error",
  });
  const latest = { ...first, theme: "light" as const };
  await source.save(latest, signal);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[2].operationId).not.toEqual(bodies[0].operationId);
  expect(bodies[2]).toMatchObject({ expectedRevision: 2, snapshot: latest });
});

test("an acknowledged save followed by a newer remote write pauses without overwriting", async () => {
  const fetcher = vi.fn(async (_path, options) =>
    options.body
      ? Response.json({ committedRevision: 2, currentRevision: 3 })
      : Response.json({ snapshot: emptyWorkspace(), revision: 1 }),
  );
  vi.stubGlobal("fetch", fetcher);
  const source = accountDataSources(crypto.randomUUID(), "session-a").workspace;
  const signal = new AbortController().signal;
  await source.load(signal);
  await expect(
    source.save({ ...emptyWorkspace(), theme: "dark" }, signal),
  ).rejects.toMatchObject({ code: "revision_conflict" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("returning owner reconciles an aborted ambiguous save with a new verified session", async () => {
  const bodies: string[] = [];
  const guards: string[] = [];
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, options) => {
      if (!options.body)
        return Response.json({ snapshot: emptyWorkspace(), revision: 1 });
      bodies.push(options.body);
      guards.push(options.headers["X-Dayplan-Session"]);
      if (fail) {
        fail = false;
        throw new TypeError("Disconnected");
      }
      return Response.json({ committedRevision: 2, currentRevision: 2 });
    }),
  );
  const userId = crypto.randomUUID();
  const source = accountDataSources(userId, "old-session").workspace;
  const signal = new AbortController().signal;
  await source.load(signal);
  await expect(
    source.save({ ...emptyWorkspace(), theme: "dark" }, signal),
  ).rejects.toThrow();
  const returning = accountDataSources(userId, "new-session").workspace;
  expect(returning).toBe(source);
  await returning.load(signal);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(guards).toEqual(["old-session", "new-session"]);
});

test("a lost import response retries unchanged and adopts the latest returned snapshot", async () => {
  const guest = seedWorkspace();
  const latest = { ...emptyWorkspace(), theme: "dark" as const };
  const imports: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, options) => {
      if (path === "/api/workspace/import") {
        imports.push(JSON.parse(options.body));
        if (imports.length === 1) throw new TypeError("Lost response");
        return Response.json({ snapshot: latest, revision: 9 });
      }
      if (!options.body)
        return Response.json({ snapshot: emptyWorkspace(), revision: 1 });
      return Response.json({ committedRevision: 10, currentRevision: 10 });
    }),
  );
  const source = accountDataSources(crypto.randomUUID(), "session").workspace;
  const signal = new AbortController().signal;
  await source.load(signal);
  await expect(source.importGuest(guest, "history", signal)).rejects.toThrow();
  expect(source.hasPendingImport).toBe(true);
  expect(await source.retryImport(signal)).toEqual(latest);
  expect(imports[1]).toEqual(imports[0]);
  await source.save(latest, signal);
  expect(imports).toHaveLength(2);
});
