import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

import { getAuth } from "@/lib/auth";
import { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("server-only", () => ({}));

let db: PGlite;
let server: PGLiteSocketServer;
let prisma: PrismaClient;
let modes: { joins: boolean; auth: ReturnType<typeof betterAuth> }[];
const calls: string[] = [];
const sql: string[] = [];
const globalPrisma = globalThis as typeof globalThis & {
  dayplanPrisma?: PrismaClient;
};
const previousPrisma = globalPrisma.dayplanPrisma;
const origin = "http://localhost:3000";

beforeAll(async () => {
  // This comparison never reads DATABASE_URL or contacts an OAuth provider.
  db = await PGlite.create();
  for (const migration of [
    "202610110001_auth",
    "202610110002_workspace",
    "202610110003_import",
  ])
    await db.exec(
      await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"),
    );
  server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" });
  await server.start();
  const traced = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: `postgresql://postgres@${server.getServerConn()}/postgres`,
      max: 1,
    }),
    log: [{ emit: "event", level: "query" }],
  });
  traced.$on("query", (event) => sql.push(event.query));
  prisma = traced;
  const measured = prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          calls.push(`${model}.${operation}`);
          return query(args);
        },
      },
    },
  });
  globalPrisma.dayplanPrisma = prisma;
  vi.stubEnv("BETTER_AUTH_URL", origin);
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "isolated-joins-secret-at-least-thirty-two-characters",
  );
  const options = getAuth().options;
  modes = [false, true].map((joins) => {
    const comparisonOptions: BetterAuthOptions = {
      ...options,
      database: prismaAdapter(measured, { provider: "postgresql" }),
      advanced: {
        ...options.advanced,
        database: { ...options.advanced?.database, joins },
      },
    };
    return { joins, auth: betterAuth(comparisonOptions) };
  });
  await Promise.all(modes.map(({ auth }) => auth.$context));
}, 60000);

afterAll(async () => {
  globalPrisma.dayplanPrisma = previousPrisma;
  await prisma?.$disconnect();
  await server?.stop();
  await db?.close();
  vi.unstubAllEnvs();
});

async function identity(remainingDays = 8) {
  const id = randomUUID();
  const sessionId = randomUUID();
  const token = randomUUID();
  await prisma.user.create({
    data: {
      id,
      name: "Verified",
      email: `${id}@example.test`,
      image: "https://example.test/avatar.png",
    },
  });
  await prisma.session.create({
    data: {
      id: sessionId,
      token,
      userId: id,
      expiresAt: new Date(Date.now() + remainingDays * 86400000),
    },
  });
  const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
    .update(token)
    .digest("base64");
  return {
    id,
    sessionId,
    headers: new Headers({
      cookie:
        "better-auth.session_token=" +
        encodeURIComponent(`${token}.${signature}`),
      origin,
    }),
  };
}

function resetTrace() {
  calls.length = 0;
  sql.length = 0;
}

function summary(joins: boolean, scenario: string, httpRequests = 0) {
  return {
    joins,
    scenario,
    httpRequests,
    clientCalls: [...calls],
    sqlStatements: sql.map((query) => query.trim().split(/\s+/, 1)[0]),
  };
}

for (const joins of [false, true]) {
  test(`joins=${joins}: repeated session verification remains database-backed`, async () => {
    const auth = modes.find((mode) => mode.joins === joins)!.auth;
    expect(auth.options.session?.cookieCache?.enabled).toBe(false);
    const owner = await identity();
    for (let attempt = 0; attempt < 2; attempt++) {
      resetTrace();
      const result = await auth.api.getSession({
        headers: owner.headers,
        query: { disableCookieCache: true },
      });
      expect(result).toMatchObject({
        user: {
          id: owner.id,
          name: "Verified",
          image: "https://example.test/avatar.png",
        },
        session: { id: owner.sessionId, userId: owner.id },
      });
      expect(calls).toEqual(
        joins ? ["Session.findFirst"] : ["Session.findFirst", "User.findFirst"],
      );
      expect(sql.filter((query) => /^SELECT\b/.test(query))).toHaveLength(2);
      expect(sql.every((query) => /^SELECT\b/.test(query))).toBe(true);
      console.info(
        "Auth comparison (not billing):",
        summary(joins, "ordinary-verification"),
      );
    }
  });

  test(`joins=${joins}: renewal updates the verified session`, async () => {
    const auth = modes.find((mode) => mode.joins === joins)!.auth;
    const owner = await identity(1);
    resetTrace();
    const result = await auth.api.getSession({
      headers: owner.headers,
      query: { disableCookieCache: true },
    });
    expect(result?.user.id).toBe(owner.id);
    expect(result!.session.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 6 * 86400000,
    );
    expect(sql.filter((query) => /^UPDATE\b/.test(query))).toHaveLength(1);
    console.info("Auth comparison (not billing):", summary(joins, "renewal"));
    expect(
      (
        await prisma.session.findUniqueOrThrow({
          where: { id: owner.sessionId },
        })
      ).expiresAt,
    ).toEqual(result!.session.expiresAt);
  });

  test(`joins=${joins}: expiration, revocation and deleted owners reject previously valid cookies`, async () => {
    const auth = modes.find((mode) => mode.joins === joins)!.auth;
    for (const invalidation of ["expired", "revoked", "deleted"] as const) {
      const owner = await identity();
      expect(
        await auth.api.getSession({
          headers: owner.headers,
          query: { disableCookieCache: true },
        }),
      ).not.toBeNull();
      if (invalidation === "expired")
        await prisma.session.update({
          where: { id: owner.sessionId },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
      else if (invalidation === "revoked")
        await prisma.session.delete({ where: { id: owner.sessionId } });
      else await prisma.user.delete({ where: { id: owner.id } });
      resetTrace();
      expect(
        await auth.api.getSession({
          headers: owner.headers,
          query: { disableCookieCache: true },
        }),
      ).toBeNull();
      expect(sql.filter((query) => /^SELECT\b/.test(query))).toHaveLength(
        invalidation === "expired" ? 3 : joins ? 2 : 1,
      );
      console.info(
        "Auth comparison (not billing):",
        summary(joins, invalidation),
      );
    }
  });

  test(`joins=${joins}: HTTP session/account reads isolate owners and sign-out revokes access`, async () => {
    const auth = modes.find((mode) => mode.joins === joins)!.auth;
    const owner = await identity();
    const other = await identity();
    for (const userId of [owner.id, other.id])
      await prisma.account.create({
        data: {
          id: randomUUID(),
          accountId: randomUUID(),
          providerId: "google",
          userId,
        },
      });
    resetTrace();
    const response = await auth.handler(
      new Request(`${origin}/api/auth/get-session?disableCookieCache=true`, {
        headers: owner.headers,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { id: owner.id },
      session: { id: owner.sessionId },
    });
    console.info(
      "Auth comparison (not billing):",
      summary(joins, "HTTP-get-session", 1),
    );
    resetTrace();
    const sessions = await auth.api.listSessions({ headers: owner.headers });
    expect(sessions.map((session) => session.id)).toEqual([owner.sessionId]);
    console.info(
      "Auth comparison (not billing):",
      summary(joins, "list-sessions"),
    );
    resetTrace();
    const accounts = await auth.api.listUserAccounts({
      headers: owner.headers,
    });
    expect(accounts).toHaveLength(1);
    console.info(
      "Auth comparison (not billing):",
      summary(joins, "list-accounts"),
    );
    expect(accounts[0].id).toBe(
      (await prisma.account.findFirstOrThrow({ where: { userId: owner.id } }))
        .id,
    );
    resetTrace();
    await auth.api.signOut({ headers: owner.headers });
    console.info("Auth comparison (not billing):", summary(joins, "sign-out"));
    expect(
      await auth.api.getSession({
        headers: owner.headers,
        query: { disableCookieCache: true },
      }),
    ).toBeNull();
    expect(
      (
        await auth.api.getSession({
          headers: other.headers,
          query: { disableCookieCache: true },
        })
      )?.user.id,
    ).toBe(other.id);
    expect(
      await auth.api.getSession({
        headers: new Headers(),
        query: { disableCookieCache: true },
      }),
    ).toBeNull();
  });
}
