import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

import { GET, POST } from "@/app/api/auth/[...all]/route";
import { getAuth } from "@/lib/auth";
import { PrismaClient } from "@/lib/generated/prisma/client";

vi.mock("server-only", () => ({}));

let db: PGlite;
let server: PGLiteSocketServer;
let prisma: PrismaClient;
const origin = "http://localhost:3000";

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(
    await readFile("prisma/migrations/202610110001_auth/migration.sql", "utf8"),
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
  vi.stubEnv("BETTER_AUTH_URL", origin);
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "isolated-oauth-test-secret-at-least-thirty-two-characters",
  );
  vi.stubEnv("GOOGLE_CLIENT_ID", "isolated-google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "isolated-google-secret");
  const provider = (await getAuth().$context).socialProviders.find(
    (p) => p.id === "google",
  )!;
  // Replace only Google's external token/profile exchange. App routes,
  // state validation, account creation, cookies and sessions remain real.
  vi.spyOn(provider, "validateAuthorizationCode").mockResolvedValue({
    accessToken: "isolated-access-token",
  });
  vi.spyOn(provider, "getUserInfo").mockResolvedValue({
    user: { name: "Taylor", email: "taylor@example.test", emailVerified: true },
    data: {
      sub: "google-account-1",
      email: "taylor@example.test",
      email_verified: true,
    },
  });
}, 60000);

afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await prisma?.$disconnect();
  await server?.stop();
  await db?.close();
});

function cookies(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function start() {
  const response = await POST(
    new Request(`${origin}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify({
        provider: "google",
        callbackURL: "/inbox?sort=title#task",
        errorCallbackURL: "/sign-in?authError=1",
      }),
    }),
  );
  expect(response.status).toBe(200);
  const url = new URL((await response.json()).url);
  expect(url.origin).toBe("https://accounts.google.com");
  expect(url.searchParams.get("redirect_uri")).toBe(
    `${origin}/api/auth/callback/google`,
  );
  expect(url.searchParams.get("prompt")).toBe("select_account");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  return { state: url.searchParams.get("state")!, cookie: cookies(response) };
}

test("Google callback creates an account, restores its cookie session, reuses the account, and signs out", async () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const flow = await start();
    const callback = await GET(
      new Request(
        `${origin}/api/auth/callback/google?code=isolated-code&state=${flow.state}`,
        {
          headers: { cookie: flow.cookie },
        },
      ),
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get("Location")).toBe("/inbox?sort=title#task");
    const cookie = cookies(callback);
    expect(cookie).toContain("better-auth.session_token=");
    const session = await GET(
      new Request(`${origin}/api/auth/get-session`, { headers: { cookie } }),
    );
    expect(await session.json()).toMatchObject({
      user: { email: "taylor@example.test" },
    });
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.account.count()).toBe(1);
    const logout = await POST(
      new Request(`${origin}/api/auth/sign-out`, {
        method: "POST",
        headers: { cookie, origin },
      }),
    );
    expect(logout.status).toBe(200);
    expect(await prisma.session.count()).toBe(0);
    const ended = await GET(
      new Request(`${origin}/api/auth/get-session`, { headers: { cookie } }),
    );
    expect(await ended.json()).toBeNull();
  }
});

test("callbacks reject missing state cookies and consent denial returns to sign-in", async () => {
  const flow = await start();
  const missing = await GET(
    new Request(
      `${origin}/api/auth/callback/google?code=isolated-code&state=${flow.state}`,
    ),
  );
  expect(missing.status).toBe(302);
  expect(missing.headers.get("Location")).toContain("error=state_mismatch");
  const denied = await start();
  const callback = await GET(
    new Request(
      `${origin}/api/auth/callback/google?error=access_denied&state=${denied.state}`,
      {
        headers: { cookie: denied.cookie },
      },
    ),
  );
  expect(callback.status).toBe(302);
  expect(callback.headers.get("Location")).toContain(
    "/sign-in?authError=1&error=access_denied",
  );
  expect(await prisma.session.count()).toBe(0);
});
