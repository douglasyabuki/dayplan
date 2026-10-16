import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

import { DELETE, PATCH, POST } from "@/app/api/account/route";
import {
  deleteAccount,
  deletionCapability,
  readDeletionCapability,
  settleAccountDeletion,
} from "@/lib/account-deletion";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { emptyWorkspace } from "@/lib/workspace/empty";
import { saveAccountWorkspace } from "@/lib/workspace/server";

vi.mock("server-only", () => ({}));

let db: PGlite;
let server: PGLiteSocketServer;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await PGlite.create();
  for (const name of [
    "202610110001_auth",
    "202610110002_workspace",
    "202610110003_import",
  ])
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
  (
    globalThis as typeof globalThis & { dayplanPrisma?: PrismaClient }
  ).dayplanPrisma = prisma;
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "isolated-deletion-secret-at-least-thirty-two-characters",
  );
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.stop();
  await db?.close();
  delete (globalThis as typeof globalThis & { dayplanPrisma?: PrismaClient })
    .dayplanPrisma;
  vi.unstubAllEnvs();
});

async function account() {
  const id = randomUUID();
  const sessionId = randomUUID();
  const token = randomUUID();
  await prisma.user.create({
    data: { id, name: "Delete me", email: `${id}@example.test` },
  });
  await prisma.session.create({
    data: {
      id: sessionId,
      userId: id,
      token,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const cookie =
    "better-auth.session_token=" +
    encodeURIComponent(
      token +
        "." +
        createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
          .update(token)
          .digest("base64"),
    );
  const headers = {
    cookie,
    origin: "http://localhost:3000",
    "X-Dayplan-Session": sessionId,
    "Content-Type": "application/json",
  };
  const request = (
    method: string,
    body: unknown = {},
    extra: Record<string, string> = {},
  ) =>
    new Request("http://localhost:3000/api/account", {
      method,
      headers: { ...headers, ...extra },
      body: JSON.stringify(body),
    });
  return { id, sessionId, headers, request };
}

test("deletion rejects guests, foreign origins, obsolete sessions, and supplied ownership", async () => {
  const a = await account();
  expect(
    (
      await POST(
        new Request("http://localhost:3000/api/account", {
          method: "POST",
          body: "{}",
        }),
      )
    ).status,
  ).toBe(401);
  expect(
    (await POST(a.request("POST", {}, { origin: "https://foreign.test" })))
      .status,
  ).toBe(403);
  expect(
    (await POST(a.request("POST", {}, { "X-Dayplan-Session": "old" }))).status,
  ).toBe(403);
  expect((await POST(a.request("POST", { userId: a.id }))).status).toBe(400);
  expect(await prisma.user.count({ where: { id: a.id } })).toBe(1);
});

test("eligibility is read-only, session-bound, and accepts valid older sessions", async () => {
  const a = await account();
  const b = await account();
  const existing = await deletionCapability(b.id, b.sessionId);
  const check = await POST(a.request("POST", { checkOnly: true }));
  expect(await check.json()).toEqual({ eligible: true });
  expect(await prisma.verification.count({ where: { value: a.id } })).toBe(0);
  expect(await prisma.verification.count({ where: { value: b.id } })).toBe(1);
  expect(readDeletionCapability(existing).userId).toBe(b.id);
  expect((await POST(b.request("POST", { checkOnly: true }))).status).toBe(200);
  expect(
    await prisma.verification.count({
      where: {
        identifier: readDeletionCapability(existing).intent,
        value: b.id,
      },
    }),
  ).toBe(1);
  expect(
    (
      await POST(
        a.request(
          "POST",
          { checkOnly: true },
          { "X-Dayplan-Session": b.sessionId },
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (await POST(a.request("POST", { checkOnly: true, resume: true }))).status,
  ).toBe(400);
  await prisma.session.update({
    where: { id: a.sessionId },
    data: { createdAt: new Date(Date.now() - 300_000) },
  });
  const older = await POST(a.request("POST", { checkOnly: true }));
  expect(await older.json()).toEqual({ eligible: true });
  await prisma.session.update({
    where: { id: a.sessionId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const expired = await POST(a.request("POST", { checkOnly: true }));
  expect(expired.status).toBe(401);
  expect(await expired.json()).toMatchObject({ code: "unauthorized" });
  expect(await prisma.verification.count({ where: { value: a.id } })).toBe(0);
  expect(await prisma.user.count({ where: { id: { in: [a.id, b.id] } } })).toBe(
    2,
  );
});

test("older valid sessions can prepare deletion, but confirmation and account binding are enforced", async () => {
  const a = await account();
  await prisma.session.update({
    where: { id: a.sessionId },
    data: { createdAt: new Date(Date.now() - 86_400_000) },
  });
  const preparation = await POST(a.request("POST"));
  expect(preparation.status).toBe(200);
  const { capability } = await preparation.json();
  expect(
    (
      await DELETE(
        a.request(
          "DELETE",
          { confirmation: "delete" },
          { "X-Dayplan-Deletion": capability },
        ),
      )
    ).status,
  ).toBe(400);
  const b = await account();
  expect(
    (
      await DELETE(
        b.request(
          "DELETE",
          { confirmation: "DELETE" },
          { "X-Dayplan-Deletion": capability },
        ),
      )
    ).status,
  ).toBe(403);
  expect(await prisma.user.count({ where: { id: { in: [a.id, b.id] } } })).toBe(
    2,
  );
  const deleted = await DELETE(
    a.request(
      "DELETE",
      { confirmation: "DELETE" },
      { "X-Dayplan-Deletion": capability },
    ),
  );
  expect(deleted.status).toBe(200);
  expect(await prisma.user.count({ where: { id: a.id } })).toBe(0);
  expect(await prisma.user.count({ where: { id: b.id } })).toBe(1);
});

test("session expiry after eligibility or preparation prevents deletion without changing account data", async () => {
  const a = await account();
  expect((await POST(a.request("POST", { checkOnly: true }))).status).toBe(200);
  const capability = await deletionCapability(a.id, a.sessionId);
  await prisma.session.update({
    where: { id: a.sessionId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  expect((await POST(a.request("POST"))).status).toBe(401);
  expect(
    (
      await DELETE(
        a.request(
          "DELETE",
          { confirmation: "DELETE" },
          { "X-Dayplan-Deletion": capability },
        ),
      )
    ).status,
  ).toBe(401);
  // The transaction also validates expiry independently of the route's guard.
  await expect(
    deleteAccount(a.id, a.sessionId, capability),
  ).rejects.toMatchObject({ code: "unauthorized" });
  expect(await prisma.user.count({ where: { id: a.id } })).toBe(1);
  expect(await prisma.verification.count({ where: { value: a.id } })).toBe(1);
});

test("deletion cascades all active owned rows, expires cookies, and keeps another account intact", async () => {
  const a = await account();
  const b = await account();
  await prisma.session.create({
    data: {
      id: randomUUID(),
      userId: a.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  await prisma.account.create({
    data: {
      id: randomUUID(),
      userId: a.id,
      providerId: "google",
      accountId: randomUUID(),
    },
  });
  await prisma.workspaceImport.create({
    data: { userId: a.id, snapshotHash: "import" },
  });
  await saveAccountWorkspace(a.id, {
    operationId: randomUUID(),
    expectedRevision: 0,
    snapshot: emptyWorkspace(),
  });
  await saveAccountWorkspace(b.id, {
    operationId: randomUUID(),
    expectedRevision: 0,
    snapshot: emptyWorkspace(),
  });
  const linkA = randomUUID();
  const linkB = randomUUID();
  const malformed = randomUUID();
  await prisma.verification.createMany({
    data: [
      {
        id: linkA,
        identifier: "auth-state:" + randomUUID(),
        value: JSON.stringify({
          link: { userId: a.id, email: "a@example.test" },
        }),
        expiresAt: new Date(Date.now() + 600_000),
      },
      {
        id: linkB,
        identifier: "auth-state:" + randomUUID(),
        value: JSON.stringify({
          link: { userId: b.id, email: "b@example.test" },
        }),
        expiresAt: new Date(Date.now() + 600_000),
      },
      {
        id: malformed,
        identifier: "auth-state:" + randomUUID(),
        value: "malformed unrelated state",
        expiresAt: new Date(Date.now() + 600_000),
      },
    ],
  });
  const preparation = await POST(a.request("POST"));
  expect(preparation.status).toBe(200);
  const { capability } = await preparation.json();
  const response = await DELETE(
    a.request(
      "DELETE",
      { confirmation: "DELETE" },
      { "X-Dayplan-Deletion": capability },
    ),
  );
  expect(response.status).toBe(200);
  expect(
    response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("better-auth.session_token=")),
  ).toMatch(/Max-Age=0/);
  expect(await prisma.user.count({ where: { id: a.id } })).toBe(0);
  expect(
    await Promise.all([
      prisma.session.count({ where: { userId: a.id } }),
      prisma.account.count({ where: { userId: a.id } }),
      prisma.workspace.count({ where: { userId: a.id } }),
      prisma.workspaceSave.count({ where: { userId: a.id } }),
      prisma.workspaceImport.count({ where: { userId: a.id } }),
    ]),
  ).toEqual([0, 0, 0, 0, 0]);
  expect(await prisma.verification.count({ where: { value: a.id } })).toBe(0);
  expect(await prisma.verification.count({ where: { id: linkA } })).toBe(0);
  expect(
    await prisma.verification.count({
      where: { id: { in: [linkB, malformed] } },
    }),
  ).toBe(2);
  expect(
    response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("better-auth.state=")),
  ).toMatch(/Max-Age=0/);
  expect(await prisma.workspace.count({ where: { userId: b.id } })).toBe(1);
  expect(await prisma.session.count({ where: { userId: b.id } })).toBe(1);
  expect(await settleAccountDeletion(capability)).toEqual({ deleted: true });
  expect((await POST(a.request("POST"))).status).toBe(401);
});

test("settling a lost response cancels an uncommitted deletion and rejects a late DELETE", async () => {
  const a = await account();
  const capability = await deletionCapability(a.id, a.sessionId);
  const response = await PATCH(
    a.request("PATCH", {}, { "X-Dayplan-Deletion": capability }),
  );
  expect(await response.json()).toEqual({ deleted: false });
  await expect(
    deleteAccount(a.id, a.sessionId, capability),
  ).rejects.toMatchObject({ code: "deletion_cancelled" });
  expect(await prisma.user.count({ where: { id: a.id } })).toBe(1);
});

test("deletion revalidates a revoked session and rolls back a failed cascade", async () => {
  const a = await account();
  const capability = await deletionCapability(a.id, a.sessionId);
  await prisma.session.delete({ where: { id: a.sessionId } });
  await expect(
    deleteAccount(a.id, a.sessionId, capability),
  ).rejects.toMatchObject({ code: "unauthorized" });
  const b = await account();
  const second = await deletionCapability(b.id, b.sessionId);
  await saveAccountWorkspace(b.id, {
    operationId: randomUUID(),
    expectedRevision: 0,
    snapshot: emptyWorkspace(),
  });
  await db.exec(
    `CREATE FUNCTION reject_account_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated deletion failure'; END $$; CREATE TRIGGER reject_account_delete BEFORE DELETE ON "Workspace" FOR EACH ROW EXECUTE FUNCTION reject_account_delete();`,
  );
  try {
    await expect(deleteAccount(b.id, b.sessionId, second)).rejects.toThrow();
    expect(await prisma.user.count({ where: { id: b.id } })).toBe(1);
    expect(await prisma.session.count({ where: { userId: b.id } })).toBe(1);
    expect(await prisma.workspaceSave.count({ where: { userId: b.id } })).toBe(
      1,
    );
    expect(await prisma.verification.count({ where: { value: b.id } })).toBe(1);
  } finally {
    await db.exec(
      'DROP TRIGGER reject_account_delete ON "Workspace"; DROP FUNCTION reject_account_delete();',
    );
  }
});

test("tampered and expired status capabilities cannot inspect accounts or authorize deletion", async () => {
  const a = await account();
  const capability = await deletionCapability(a.id, a.sessionId);
  expect(() => readDeletionCapability(capability + "x")).toThrow();
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000);
  try {
    expect(() => readDeletionCapability(capability)).toThrow();
  } finally {
    vi.restoreAllMocks();
  }
});

test("fresh sign-in can cancel an old deletion intent without deleting or changing another account", async () => {
  const a = await account();
  const b = await account();
  const old = await deletionCapability(a.id, a.sessionId);
  const other = await deletionCapability(b.id, b.sessionId);
  const resumed = await POST(a.request("POST", { resume: true }));
  expect(await resumed.json()).toEqual({ resumed: true });
  await expect(deleteAccount(a.id, a.sessionId, old)).rejects.toMatchObject({
    code: "deletion_cancelled",
  });
  expect(readDeletionCapability(other).userId).toBe(b.id);
  expect(await prisma.verification.count({ where: { value: b.id } })).toBe(1);
  expect(await prisma.user.count({ where: { id: { in: [a.id, b.id] } } })).toBe(
    2,
  );
});
