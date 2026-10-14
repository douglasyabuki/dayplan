import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { GET, POST } from "@/app/api/auth/[...all]/route";
import { getAuth } from "@/lib/auth";
import { PrismaClient } from "@/lib/generated/prisma/client";
import type { AuthProvider } from "@/types-and-constants/auth";

vi.mock("server-only", () => ({}));

const origin = "http://localhost:3000";
let db: PGlite;
let server: PGLiteSocketServer;
let prisma: PrismaClient;
let google = { id: "google-1", email: "same@example.test", verified: true };
let github = {
  id: 100,
  email: null as string | null,
  emails: [{ email: "same@example.test", primary: true, verified: true }],
};

beforeAll(async () => {
  db = await PGlite.create();
  for (const migration of [
    "202610110001_auth",
    "202610110002_workspace",
    "202610110003_import",
  ]) {
    await db.exec(
      await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"),
    );
  }
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
    "isolated-social-test-secret-at-least-thirty-two-characters",
  );
  for (const provider of ["GOOGLE", "GITHUB"]) {
    vi.stubEnv(`${provider}_CLIENT_ID`, `isolated-${provider}-client`);
    vi.stubEnv(`${provider}_CLIENT_SECRET`, `isolated-${provider}-secret`);
  }
  const providers = (await getAuth().$context).socialProviders;
  const googleProvider = providers.find(
    (provider) => provider.id === "google",
  )!;
  vi.spyOn(googleProvider, "validateAuthorizationCode").mockResolvedValue({
    accessToken: "google-token",
  });
  vi.spyOn(googleProvider, "getUserInfo").mockImplementation(async () => ({
    user: {
      name: "Google name",
      email: google.email,
      emailVerified: google.verified,
    },
    data: {
      sub: google.id,
      email: google.email,
      email_verified: google.verified,
    },
  }));
  // GitHub token exchange and email resolution remain the installed provider's real code.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://github.com/login/oauth/access_token")
      return Response.json({
        access_token: "github-token",
        token_type: "bearer",
        expires_in: 28800,
        refresh_token: "github-refresh",
        refresh_token_expires_in: 15724800,
        scope: "read:user,user:email",
      });
    if (url === "https://api.github.com/user")
      return Response.json({
        id: github.id,
        login: "github-user",
        name: "GitHub name",
        email: github.email,
        avatar_url: "https://example.test/avatar",
      });
    if (url === "https://api.github.com/user/emails")
      return Response.json(github.emails);
    throw new Error(`Unexpected external request: ${url}`);
  });
}, 60000);

beforeEach(async () => {
  await prisma.user.deleteMany();
  await prisma.verification.deleteMany();
  google = { id: "google-1", email: "same@example.test", verified: true };
  github = {
    id: 100,
    email: null,
    emails: [{ email: "same@example.test", primary: true, verified: true }],
  };
});

afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await prisma?.$disconnect();
  await server?.stop();
  await db?.close();
});

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function post(path: string, body: object, cookie = "") {
  return POST(
    new Request(`${origin}/api/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", origin, cookie },
      body: JSON.stringify(body),
    }),
  );
}

async function begin(provider: AuthProvider, cookie = "") {
  const response = await post(
    cookie ? "link-social" : "sign-in/social",
    {
      provider,
      callbackURL: "/inbox?sort=title#task",
      errorCallbackURL: "/inbox?settings=account&connection=error",
    },
    cookie,
  );
  expect(response.status).toBe(200);
  const url = new URL((await response.json()).url);
  expect(url.searchParams.get("redirect_uri")).toBe(
    `${origin}/api/auth/callback/${provider}`,
  );
  const jar = new Map<string, string>();
  for (const part of [cookie, cookies(response)].join("; ").split("; ")) {
    const separator = part.indexOf("=");
    if (separator >= 0)
      jar.set(part.slice(0, separator), part.slice(separator + 1));
  }
  return {
    state: url.searchParams.get("state")!,
    cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
  };
}

async function finish(
  provider: AuthProvider,
  flow: Awaited<ReturnType<typeof begin>>,
  suffix = "code=isolated-code",
) {
  return GET(
    new Request(
      `${origin}/api/auth/callback/${provider}?${suffix}&state=${flow.state}`,
      { headers: { cookie: flow.cookie } },
    ),
  );
}

async function signIn(provider: AuthProvider) {
  const response = await finish(provider, await begin(provider));
  expect(response.headers.get("Location")).toBe("/inbox?sort=title#task");
  const cookie = cookies(response);
  expect(cookie).toContain("better-auth.session_token=");
  const session = await GET(
    new Request(`${origin}/api/auth/get-session`, { headers: { cookie } }),
  );
  return {
    cookie,
    user: (await session.json()).user as {
      id: string;
      name: string;
      email: string;
    },
  };
}

for (const [first, second] of [
  ["google", "github"],
  ["github", "google"],
] as const) {
  test(`${first} → ${second} links the same verified resolved email and preserves workspace`, async () => {
    const original = await signIn(first);
    await prisma.workspace.create({
      data: {
        userId: original.user.id,
        snapshot: { tasks: ["original-task"] },
        revision: 1,
      },
    });
    expect((await post("sign-out", {}, original.cookie)).status).toBe(200);
    const linked = await signIn(second);
    expect(linked.user.id).toBe(original.user.id);
    expect(linked.user.name).toBe(original.user.name);
    expect(await prisma.account.count()).toBe(2);
    expect(
      (await prisma.workspace.findUnique({ where: { userId: linked.user.id } }))
        ?.snapshot,
    ).toEqual({ tasks: ["original-task"] });
    expect((await signIn(second)).user.id).toBe(original.user.id);
  });

  test(`${first} → ${second} does not match a secondary GitHub email`, async () => {
    github.emails = [
      { email: "github-primary@example.test", primary: true, verified: true },
      { email: google.email, primary: false, verified: true },
    ];
    const original = await signIn(first);
    await post("sign-out", {}, original.cookie);
    expect((await signIn(second)).user.id).not.toBe(original.user.id);
    expect(await prisma.user.count()).toBe(2);
  });
}

test("GitHub private email resolves through /user/emails and expiration data is persisted", async () => {
  const original = await signIn("google");
  await post("sign-out", {}, original.cookie);
  const linked = await signIn("github");
  expect(linked.user.id).toBe(original.user.id);
  const account = await prisma.account.findFirstOrThrow({
    where: { providerId: "github" },
  });
  expect(account.refreshToken).toBe("github-refresh");
  expect(account.accessTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  expect(account.refreshTokenExpiresAt!.getTime()).toBeGreaterThan(
    account.accessTokenExpiresAt!.getTime(),
  );
});

for (const provider of ["google", "github"] as const) {
  for (const explicit of [false, true]) {
    for (const different of explicit ? [false, true] : [false]) {
      test(`${provider} rejects unverified ${explicit ? "explicit" : "automatic"} linking (${different ? "different" : "same"} email)`, async () => {
        const original = await signIn(
          provider === "google" ? "github" : "google",
        );
        const email = different
          ? "different@example.test"
          : original.user.email;
        if (provider === "google")
          google = { ...google, email, verified: false };
        else
          github.emails = [
            { email, primary: true, verified: false },
            {
              email: "verified-secondary@example.test",
              primary: false,
              verified: true,
            },
          ];
        if (!explicit) await post("sign-out", {}, original.cookie);
        const sessionsBefore = await prisma.session.count();
        const response = await finish(
          provider,
          await begin(provider, explicit ? original.cookie : ""),
        );
        expect(response.headers.get("Location")).toMatch(
          /error=(unable_to_link_account|account_not_linked|email_not_verified)/,
        );
        expect(await prisma.account.count()).toBe(1);
        expect(
          await prisma.account.count({
            where: { providerId: provider, userId: original.user.id },
          }),
        ).toBe(0);
        expect(cookies(response)).not.toContain("better-auth.session_token=");
        expect(await prisma.session.count()).toBe(sessionsBefore);
      });
    }
  }
}

test("automatic linking rejects an existing unverified local email and neither provider is trusted", async () => {
  const original = await signIn("google");
  await prisma.user.update({
    where: { id: original.user.id },
    data: { emailVerified: false },
  });
  await post("sign-out", {}, original.cookie);
  const response = await finish("github", await begin("github"));
  expect(response.headers.get("Location")).toContain("error=");
  expect(await prisma.account.count()).toBe(1);
  expect((await getAuth().$context).trustedProviders).toEqual([]);
});

test("explicit different-email linking preserves the user and profile and permits later sign-in", async () => {
  const original = await signIn("google");
  await prisma.workspace.create({
    data: {
      userId: original.user.id,
      snapshot: { tasks: ["keep-this-task"] },
      revision: 1,
    },
  });
  github.emails = [
    { email: "different@example.test", primary: true, verified: true },
  ];
  const linked = await finish("github", await begin("github", original.cookie));
  expect(linked.headers.get("Location")).toBe("/inbox?sort=title#task");
  expect(await prisma.user.count()).toBe(1);
  expect(
    (await prisma.user.findUniqueOrThrow({ where: { id: original.user.id } }))
      .email,
  ).toBe(original.user.email);
  expect((await signIn("github")).user).toMatchObject(original.user);
  expect(
    (
      await prisma.workspace.findUniqueOrThrow({
        where: { userId: original.user.id },
      })
    ).snapshot,
  ).toEqual({ tasks: ["keep-this-task"] });
});

test("a public verified GitHub profile email is the matching identity even when its primary email differs", async () => {
  const original = await signIn("google");
  await post("sign-out", {}, original.cookie);
  github.email = google.email;
  github.emails = [
    { email: "other-primary@example.test", primary: true, verified: true },
    { email: google.email, primary: false, verified: true },
  ];
  expect((await signIn("github")).user.id).toBe(original.user.id);
});

test("an identity already owned elsewhere cannot be connected", async () => {
  const original = await signIn("google");
  github.emails = [
    { email: "different@example.test", primary: true, verified: true },
  ];
  const other = await signIn("github");
  const response = await finish(
    "github",
    await begin("github", original.cookie),
  );
  expect(response.headers.get("Location")).toContain(
    "account_already_linked_to_different_user",
  );
  expect(
    await prisma.account.count({ where: { userId: original.user.id } }),
  ).toBe(1);
  expect(await prisma.account.count({ where: { userId: other.user.id } })).toBe(
    1,
  );
});

test("missing GitHub email, cancellation, and missing state never create an account", async () => {
  github.emails = [];
  expect(
    (await finish("github", await begin("github"))).headers.get("Location"),
  ).toContain("email_not_found");
  expect(
    (
      await finish("github", await begin("github"), "error=access_denied")
    ).headers.get("Location"),
  ).toContain("access_denied");
  const flow = await begin("github");
  expect(
    (await finish("github", { ...flow, cookie: "" })).headers.get("Location"),
  ).toContain("state_mismatch");
  expect(await prisma.user.count()).toBe(0);
});

test("unlink protects the last account, refreshes the list, and requires a fresh session", async () => {
  const original = await signIn("google");
  const googleAccount = await prisma.account.findFirstOrThrow({
    where: { providerId: "google" },
  });
  expect(
    (
      await post(
        "unlink-account",
        { accountId: googleAccount.id },
        original.cookie,
      )
    ).status,
  ).toBe(400);
  await finish("github", await begin("github", original.cookie));
  const githubAccount = await prisma.account.findFirstOrThrow({
    where: { providerId: "github" },
  });
  const session = await prisma.session.findFirstOrThrow({
    where: { userId: original.user.id },
  });
  await prisma.session.update({
    where: { id: session.id },
    data: { createdAt: new Date(Date.now() - 2 * 86400000) },
  });
  const stale = await post(
    "unlink-account",
    { accountId: githubAccount.id },
    original.cookie,
  );
  expect(stale.status).toBe(403);
  expect(await stale.json()).toMatchObject({ code: "SESSION_NOT_FRESH" });
  await prisma.session.update({
    where: { id: session.id },
    data: { createdAt: new Date() },
  });
  expect(
    (
      await post(
        "unlink-account",
        { accountId: githubAccount.id },
        original.cookie,
      )
    ).status,
  ).toBe(200);
  const list = await GET(
    new Request(`${origin}/api/auth/list-accounts`, {
      headers: { cookie: original.cookie },
    }),
  );
  expect(await list.json()).toMatchObject([
    { id: googleAccount.id, providerId: "google" },
  ]);
  expect(await prisma.account.count()).toBe(1);
});
