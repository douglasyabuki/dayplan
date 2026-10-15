// Explicit integration check for docker-compose.yaml's local PostgreSQL only.
// Run: node --conditions=react-server --import tsx tests/workspace-postgres-check.ts
// Creates and drops its own random database; never reads DATABASE_URL.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "@/lib/generated/prisma/client";
import { emptyWorkspace } from "@/lib/workspace/empty";
import { seedWorkspace } from "@/lib/workspace/seed";
import {
  importGuestWorkspace,
  previewGuestImport,
  saveAccountWorkspace,
} from "@/lib/workspace/server";

const database = `dayplan_lock_test_${randomUUID().replaceAll("-", "")}`;
const local = "postgresql://dayplan:dayplan@127.0.0.1:5433/";
const admin = new Pool({ connectionString: local + "postgres" });
const observer = new Pool({ connectionString: local + database });
const barrierKey = 716105;
const clients = ["writer-a", "writer-b"].map(
  (application_name) =>
    new PrismaClient({
      adapter: new PrismaPg({
        connectionString: local + database,
        application_name,
        max: 1,
      }),
    }),
);
const globalPrisma = globalThis as typeof globalThis & {
  dayplanPrisma?: PrismaClient;
};
const previousPrisma = globalPrisma.dayplanPrisma;

function runAs<T>(index: number, operation: () => Promise<T>): Promise<T> {
  // Both server operations capture getPrisma() before their first await.
  globalPrisma.dayplanPrisma = clients[index];
  return operation();
}

async function waitForBlocked(application: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const result = await observer.query(
      "SELECT pid FROM pg_stat_activity WHERE datname = $1 AND application_name = $2 AND cardinality(pg_blocking_pids(pid)) > 0",
      [database, application],
    );
    if (result.rowCount) return;
    await delay(10);
  }
  throw new Error(`Expected a real lock wait for ${application}`);
}

async function owner(): Promise<string> {
  const id = randomUUID();
  await clients[0].user.create({
    data: { id, name: "Lock test", email: `${id}@example.test` },
  });
  return id;
}

function save(userId: string, expectedRevision: number) {
  return {
    userId,
    input: {
      operationId: randomUUID(),
      expectedRevision,
      snapshot: emptyWorkspace(),
    },
  };
}

async function gatedWriters(
  first: () => Promise<unknown>,
  second: () => Promise<unknown>,
) {
  const barrier = await observer.connect();
  const pending: Promise<unknown>[] = [];
  try {
    await barrier.query("SELECT pg_advisory_lock($1)", [barrierKey]);
    const a = runAs(0, first);
    pending.push(a);
    // Observe failures immediately, including when a later barrier assertion fails.
    const aResult = Promise.allSettled([a]);
    await waitForBlocked("writer-a");
    const b = runAs(1, second);
    pending.push(b);
    const bResult = Promise.allSettled([b]);
    await waitForBlocked("writer-b");
    await barrier.query("SELECT pg_advisory_unlock($1)", [barrierKey]);
    return [(await aResult)[0], (await bResult)[0]] as const;
  } finally {
    await barrier.query("SELECT pg_advisory_unlock_all()");
    await Promise.allSettled(pending);
    barrier.release();
  }
}

async function main(): Promise<void> {
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    for (const migration of [
      "202610110001_auth",
      "202610110002_workspace",
      "202610110003_import",
    ])
      await observer.query(
        await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"),
      );
    const isolation = await observer.query(
      "SHOW default_transaction_isolation",
    );
    assert.equal(
      isolation.rows[0].default_transaction_isolation,
      "read committed",
    );
    await observer.query(`CREATE FUNCTION gate_workspace_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(${barrierKey}); RETURN NEW; END $$;
    CREATE TRIGGER gate_workspace BEFORE INSERT OR UPDATE ON "Workspace" FOR EACH ROW EXECUTE FUNCTION gate_workspace_write();`);

    for (const revision of [0, 1]) {
      const userId = await owner();
      if (revision) {
        const initial = save(userId, 0);
        await runAs(0, () => saveAccountWorkspace(userId, initial.input));
      }
      const a = save(userId, revision);
      const b = save(userId, revision);
      const outcomes = await gatedWriters(
        () => saveAccountWorkspace(userId, a.input),
        () => saveAccountWorkspace(userId, b.input),
      );
      assert.equal(outcomes[0].status, "fulfilled");
      assert.equal(outcomes[1].status, "rejected");
      if (outcomes[1].status === "rejected")
        assert.equal(outcomes[1].reason.code, "revision_conflict");
      assert.equal(
        await clients[0].workspaceSave.count({ where: { userId } }),
        revision + 1,
      );
      console.log(`PASS concurrent distinct saves at revision ${revision}`);
    }

    for (const mode of ["replay", "next-revision", "import"] as const) {
      const userId = await owner();
      const a = save(userId, 0);
      const guest = seedWorkspace();
      const preview = await runAs(0, () => previewGuestImport(userId, guest));
      const outcomes = await gatedWriters(
        () => saveAccountWorkspace(userId, a.input),
        () =>
          mode === "import"
            ? importGuestWorkspace(userId, {
                snapshot: guest,
                expectedRevision: 1,
                confirmedHistoryToken: preview.historyToken,
              })
            : saveAccountWorkspace(
                userId,
                mode === "replay" ? a.input : save(userId, 1).input,
              ),
      );
      assert.equal(outcomes[0].status, "fulfilled");
      assert.equal(outcomes[1].status, "fulfilled");
      const workspace = await clients[0].workspace.findUniqueOrThrow({
        where: { userId },
      });
      assert.equal(workspace.revision, mode === "replay" ? 1 : 2);
      if (mode === "replay" && outcomes[1].status === "fulfilled")
        assert.deepEqual(outcomes[1].value, {
          committedRevision: 1,
          currentRevision: 1,
        });
      console.log(`PASS post-lock visibility: ${mode}`);
    }

    for (const importFirst of [false, true]) {
      const userId = await owner();
      const guest = seedWorkspace();
      const preview = await runAs(0, () => previewGuestImport(userId, guest));
      const importOperation = () =>
        importGuestWorkspace(userId, {
          snapshot: guest,
          expectedRevision: 0,
          confirmedHistoryToken: preview.historyToken,
        });
      const saveOperation = () =>
        saveAccountWorkspace(userId, save(userId, 0).input);
      const outcomes = await gatedWriters(
        importFirst ? importOperation : saveOperation,
        importFirst ? saveOperation : importOperation,
      );
      assert.equal(outcomes[0].status, "fulfilled");
      assert.equal(outcomes[1].status, "rejected");
      if (outcomes[1].status === "rejected")
        assert.equal(outcomes[1].reason.code, "revision_conflict");
      assert.equal(
        (await clients[0].workspace.findUniqueOrThrow({ where: { userId } }))
          .revision,
        1,
      );
      assert.equal(
        await clients[0].workspaceSave.count({ where: { userId } }),
        importFirst ? 0 : 1,
      );
      assert.equal(
        await clients[0].workspaceImport.count({ where: { userId } }),
        importFirst ? 1 : 0,
      );
      console.log(
        `PASS same-revision ${importFirst ? "import/save" : "save/import"} conflict`,
      );
    }

    const deleted = await owner();
    await clients[0].user.delete({ where: { id: deleted } });
    await assert.rejects(
      runAs(0, () => saveAccountWorkspace(deleted, save(deleted, 0).input)),
      { code: "unauthorized" },
    );
    console.log("PASS deletion before save");

    const userId = await owner();
    const deletion = await gatedWriters(
      () => saveAccountWorkspace(userId, save(userId, 0).input),
      () => clients[1].user.delete({ where: { id: userId } }),
    );
    assert.equal(deletion[0].status, "fulfilled");
    assert.equal(deletion[1].status, "fulfilled");
    assert.equal(await clients[0].workspace.count({ where: { userId } }), 0);
    assert.equal(
      await clients[0].workspaceSave.count({ where: { userId } }),
      0,
    );
    console.log("PASS deletion waits for save then cascades after commit");

    const deleting = await owner();
    const connection = await observer.connect();
    try {
      await connection.query("BEGIN");
      await connection.query('DELETE FROM "user" WHERE id = $1', [deleting]);
      const pending = runAs(1, () =>
        saveAccountWorkspace(deleting, save(deleting, 0).input),
      );
      const result = Promise.allSettled([pending]);
      await waitForBlocked("writer-b");
      await connection.query("COMMIT");
      const outcome = (await result)[0];
      assert.equal(outcome.status, "rejected");
      if (outcome.status === "rejected")
        assert.equal(outcome.reason.code, "unauthorized");
      assert.equal(
        await clients[0].workspace.count({ where: { userId: deleting } }),
        0,
      );
      console.log("PASS save waits for deletion then rejects deleted owner");
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
    }
    console.log(
      "10 PostgreSQL lock checks passed (independent connections, READ COMMITTED).",
    );
  } finally {
    globalPrisma.dayplanPrisma = previousPrisma;
    await Promise.allSettled(clients.map((client) => client.$disconnect()));
    await observer.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
