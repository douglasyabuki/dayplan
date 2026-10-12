import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

import {
  GET as getProfile,
  PATCH as patchProfile,
} from "@/app/api/profile/route";
import {
  GET as getWorkspace,
  PUT as putWorkspace,
} from "@/app/api/workspace/route";
import { getAuth } from "@/lib/auth";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { requireAccountSession } from "@/lib/server-session";
import { emptyWorkspace } from "@/lib/workspace/empty";
import { seedWorkspace } from "@/lib/workspace/seed";
import {
  importGuestWorkspace,
  loadAccountWorkspace,
  previewGuestImport,
  saveAccountWorkspace,
} from "@/lib/workspace/server";

vi.mock("server-only", () => ({}));

let db: PGlite;
let server: PGLiteSocketServer;
let prisma: PrismaClient;
let cookie: string;
const migrations = [
  "202610110001_auth",
  "202610110002_workspace",
  "202610110003_import",
];

beforeAll(async () => {
  // In-memory PostgreSQL: this suite never reads the connected DATABASE_URL.
  db = await PGlite.create();
  for (const name of migrations)
    await db.exec(
      await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"),
    );
  server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" });
  await server.start();
  prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: `postgresql://postgres@${server.getServerConn()}/postgres`,
      max: 1,
    }),
  });
  (globalThis as unknown as { dayplanPrisma: PrismaClient }).dayplanPrisma =
    prisma;
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "isolated-test-secret-at-least-thirty-two-characters",
  );
  await prisma.user.create({
    data: { id: "account-a", email: "a@example.test", name: "A" },
  });
  await prisma.user.create({
    data: { id: "account-b", email: "b@example.test", name: "B" },
  });
  await prisma.session.create({
    data: {
      id: "session-a",
      userId: "account-a",
      token: "isolated-session-token",
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const { createHmac } = await import("node:crypto");
  cookie =
    "better-auth.session_token=" +
    encodeURIComponent(
      "isolated-session-token." +
        createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
          .update("isolated-session-token")
          .digest("base64"),
    );
}, 60000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.stop();
  await db?.close();
  vi.unstubAllEnvs();
});

test("migrations apply from empty and preserve rows through each checkpoint", async () => {
  const isolated = await PGlite.create();
  try {
    await isolated.exec(
      await readFile(
        `prisma/migrations/${migrations[0]}/migration.sql`,
        "utf8",
      ),
    );
    await isolated.query(
      'INSERT INTO "user" (id,name,email,"updatedAt") VALUES ($1,$2,$3,now())',
      ["existing", "Existing", "existing@example.test"],
    );
    await isolated.exec(
      await readFile(
        `prisma/migrations/${migrations[1]}/migration.sql`,
        "utf8",
      ),
    );
    await isolated.query(
      'INSERT INTO "Workspace" ("userId",snapshot,revision,"updatedAt") VALUES ($1,$2,1,now())',
      ["existing", JSON.stringify(emptyWorkspace())],
    );
    await isolated.exec(
      await readFile(
        `prisma/migrations/${migrations[2]}/migration.sql`,
        "utf8",
      ),
    );
    expect(
      (await isolated.query('SELECT revision FROM "Workspace"')).rows,
    ).toEqual([{ revision: 1 }]);
  } finally {
    await isolated.close();
  }
}, 60000);

test("verified sessions derive ownership and reject missing cookies, mismatches and invalid origins", async () => {
  const request = (headers: Record<string, string>, method = "GET") =>
    new Request("http://localhost:3000/api/workspace", { headers, method });
  const headers = { cookie, "X-Dayplan-Session": "session-a" };
  expect(await requireAccountSession(request(headers))).toEqual({
    userId: "account-a",
    sessionId: "session-a",
  });
  await expect(requireAccountSession(request({}))).rejects.toMatchObject({
    status: 401,
  });
  await expect(
    requireAccountSession(
      request({ ...headers, "X-Dayplan-Session": "session-b" }),
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    requireAccountSession(
      request({ ...headers, origin: "https://other.test" }, "PUT"),
    ),
  ).rejects.toMatchObject({ status: 403 });
  const forged = await putWorkspace(
    new Request("http://localhost:3000/api/workspace", {
      method: "PUT",
      headers: { ...headers, origin: "http://localhost:3000" },
      body: JSON.stringify({
        userId: "account-b",
        expectedRevision: 0,
        snapshot: emptyWorkspace(),
        operationId: randomUUID(),
      }),
    }),
  );
  expect(forged.status).toBe(400);
  const profile = await getProfile(request(headers));
  expect(await profile.json()).toMatchObject({
    name: "A",
    email: "a@example.test",
  });
  expect((await getWorkspace(request({}))).status).toBe(401);
});

test("save retries recover completed writes, reject changed payloads and expose newer revisions", async () => {
  const input = {
    operationId: randomUUID(),
    expectedRevision: 0,
    snapshot: emptyWorkspace(),
  };
  expect(await saveAccountWorkspace("account-a", input)).toEqual({
    committedRevision: 1,
    currentRevision: 1,
  });
  expect(await saveAccountWorkspace("account-a", input)).toEqual({
    committedRevision: 1,
    currentRevision: 1,
  });
  await expect(
    saveAccountWorkspace("account-a", {
      ...input,
      snapshot: { ...input.snapshot, theme: "dark" },
    }),
  ).rejects.toMatchObject({ code: "operation_mismatch" });
  await saveAccountWorkspace("account-a", {
    ...input,
    operationId: randomUUID(),
    expectedRevision: 1,
  });
  expect(await saveAccountWorkspace("account-a", input)).toEqual({
    committedRevision: 1,
    currentRevision: 2,
  });
  await expect(
    saveAccountWorkspace("account-a", { ...input, operationId: randomUUID() }),
  ).rejects.toMatchObject({ code: "revision_conflict" });
});

test("concurrent initial saves and duplicate requests produce a single revision", async () => {
  const input = {
    operationId: randomUUID(),
    expectedRevision: 0,
    snapshot: emptyWorkspace(),
  };
  const duplicate = await Promise.all([
    saveAccountWorkspace("account-b", input),
    saveAccountWorkspace("account-b", input),
  ]);
  expect(duplicate).toEqual([
    { committedRevision: 1, currentRevision: 1 },
    { committedRevision: 1, currentRevision: 1 },
  ]);
  const outcomes = await Promise.allSettled([
    saveAccountWorkspace("account-b", {
      ...input,
      operationId: randomUUID(),
      expectedRevision: 1,
    }),
    saveAccountWorkspace("account-b", {
      ...input,
      operationId: randomUUID(),
      expectedRevision: 1,
    }),
  ]);
  expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
  expect(await loadAccountWorkspace("account-b")).toMatchObject({
    revision: 2,
  });
});

test("import recovery returns current edits and changed guest snapshots require fresh confirmation", async () => {
  const guest = seedWorkspace();
  const preview = await previewGuestImport("account-a", guest);
  const input = {
    snapshot: guest,
    expectedRevision: 2,
    confirmedHistoryToken: preview.historyToken,
  };
  const imported = await importGuestWorkspace("account-a", input);
  expect(imported.snapshot.tasks).toHaveLength(guest.tasks.length);
  expect(new Set(imported.snapshot.tasks.map((t) => t.id))).not.toContain(
    guest.tasks[0].id,
  );
  const edited = { ...imported.snapshot, theme: "dark" as const };
  await saveAccountWorkspace("account-a", {
    snapshot: edited,
    operationId: randomUUID(),
    expectedRevision: imported.revision,
  });
  const recovered = await importGuestWorkspace("account-a", input);
  expect(recovered).toMatchObject({
    revision: imported.revision + 1,
    snapshot: { theme: "dark" },
  });
  expect(recovered.snapshot.tasks).toHaveLength(guest.tasks.length);
  const changed = structuredClone(guest);
  changed.tasks[0].title = "Changed guest task";
  await expect(
    importGuestWorkspace("account-a", {
      ...input,
      snapshot: changed,
      expectedRevision: recovered.revision,
    }),
  ).rejects.toMatchObject({ code: "import_confirmation_required" });
  const newPreview = await previewGuestImport("account-a", changed);
  expect(newPreview.hasPriorImports).toBe(true);
  const again = await importGuestWorkspace("account-a", {
    snapshot: changed,
    expectedRevision: recovered.revision,
    confirmedHistoryToken: newPreview.historyToken,
  });
  expect(again.snapshot.tasks).toHaveLength(guest.tasks.length * 2);
});

test("concurrent imports deduplicate and require renewed confirmation when history changes", async () => {
  const userId = randomUUID();
  await prisma.user.create({
    data: { id: userId, email: `${userId}@example.test`, name: "Concurrent" },
  });
  const guest = seedWorkspace();
  const preview = await previewGuestImport(userId, guest);
  const input = {
    snapshot: guest,
    expectedRevision: 0,
    confirmedHistoryToken: preview.historyToken,
  };
  const duplicate = await Promise.all([
    importGuestWorkspace(userId, input),
    importGuestWorkspace(userId, input),
  ]);
  expect(duplicate[0]).toEqual(duplicate[1]);
  expect(duplicate[0].revision).toBe(1);
  expect(duplicate[0].snapshot.tasks).toHaveLength(guest.tasks.length);
  const first = structuredClone(guest);
  const second = structuredClone(guest);
  first.tasks[0].title = "First changed guest";
  second.tasks[0].title = "Second changed guest";
  const confirmed = await previewGuestImport(userId, first);
  const outcomes = await Promise.allSettled(
    [first, second].map((snapshot) =>
      importGuestWorkspace(userId, {
        snapshot,
        expectedRevision: 1,
        confirmedHistoryToken: confirmed.historyToken,
      }),
    ),
  );
  expect(
    outcomes.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(outcomes.find((result) => result.status === "rejected")).toMatchObject(
    {
      reason: { code: "import_confirmation_required" },
    },
  );
  expect((await loadAccountWorkspace(userId)).snapshot?.tasks).toHaveLength(
    guest.tasks.length * 2,
  );
});

test("profile mutation changes only verified owner, and sign-out revokes the session", async () => {
  const response = await patchProfile(
    new Request("http://localhost:3000/api/profile", {
      method: "PATCH",
      headers: {
        cookie,
        "X-Dayplan-Session": "session-a",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ name: "Updated A" }),
    }),
  );
  expect(response.status).toBe(200);
  expect(
    (await prisma.user.findUniqueOrThrow({ where: { id: "account-b" } })).name,
  ).toBe("B");
  await getAuth().api.signOut({
    headers: new Headers({ cookie, origin: "http://localhost:3000" }),
  });
  await expect(
    requireAccountSession(
      new Request("http://localhost:3000/api/workspace", {
        headers: { cookie, "X-Dayplan-Session": "session-a" },
      }),
    ),
  ).rejects.toMatchObject({ status: 401 });
});

test("failed receipt insertion rolls back the entire import", async () => {
  await prisma.user.create({
    data: { id: "rollback", email: "rollback@example.test", name: "Rollback" },
  });
  await db.exec(`CREATE FUNCTION reject_import_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = 'rollback' THEN RAISE EXCEPTION 'isolated receipt failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_import BEFORE INSERT ON "WorkspaceImport" FOR EACH ROW EXECUTE FUNCTION reject_import_receipt();`);
  const snapshot = seedWorkspace();
  const preview = await previewGuestImport("rollback", snapshot);
  try {
    await expect(
      importGuestWorkspace("rollback", {
        snapshot,
        expectedRevision: 0,
        confirmedHistoryToken: preview.historyToken,
      }),
    ).rejects.toThrow();
    expect(await loadAccountWorkspace("rollback")).toEqual({
      snapshot: null,
      revision: 0,
    });
    expect(
      await prisma.workspaceImport.count({ where: { userId: "rollback" } }),
    ).toBe(0);
  } finally {
    await db.exec(
      'DROP TRIGGER reject_import ON "WorkspaceImport"; DROP FUNCTION reject_import_receipt();',
    );
  }
});

test("expired database sessions cannot read account data", async () => {
  await prisma.session.create({
    data: {
      id: "expired",
      userId: "account-b",
      token: "expired-token",
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  const { createHmac } = await import("node:crypto");
  const signed = encodeURIComponent(
    "expired-token." +
      createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
        .update("expired-token")
        .digest("base64"),
  );
  const response = await getWorkspace(
    new Request("http://localhost:3000/api/workspace", {
      headers: {
        cookie: "better-auth.session_token=" + signed,
        "X-Dayplan-Session": "expired",
      },
    }),
  );
  expect(response.status).toBe(401);
});
