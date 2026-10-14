import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({}) }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "configuration-test-secret-at-least-thirty-two-characters",
  );
  for (const provider of ["GOOGLE", "GITHUB"]) {
    vi.stubEnv(`${provider}_CLIENT_ID`, "");
    vi.stubEnv(`${provider}_CLIENT_SECRET`, "");
  }
});

afterEach(() => vi.unstubAllEnvs());

for (const provider of ["google", "github"] as const) {
  test(`${provider} can be enabled without the other provider`, async () => {
    vi.stubEnv(`${provider.toUpperCase()}_CLIENT_ID`, "isolated-client");
    vi.stubEnv(`${provider.toUpperCase()}_CLIENT_SECRET`, "isolated-secret");
    const { GET } = await import("@/app/api/auth-options/route");
    const response = GET();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      google: provider === "google",
      github: provider === "github",
    });
    const { getAuth } = await import("@/lib/auth");
    expect(
      (await getAuth().$context).socialProviders.map((item) => item.id),
    ).toEqual([provider]);
    expect(getAuth().options.account?.accountLinking).toEqual({
      enabled: true,
      disableImplicitLinking: false,
      trustedProviders: [],
      allowDifferentEmails: true,
      allowUnlinkingAll: false,
      updateUserInfoOnLink: false,
    });
  });
}

test("missing core configuration disables both providers without initializing auth", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "");
  const { GET } = await import("@/app/api/auth-options/route");
  expect(await GET().json()).toEqual({ google: false, github: false });
});
