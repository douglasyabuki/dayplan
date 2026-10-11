import { afterEach, expect, test, vi } from "vitest";

import {
  GUEST_PROFILE_KEY,
  readGuestProfile,
  writeGuestProfile,
} from "@/stores/account/persistence";

afterEach(() => vi.unstubAllGlobals());

function storage(values: Record<string, string> = {}) {
  const entries = new Map(Object.entries(values));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  });
  return entries;
}

test("default guest has no mock identity or email", () => {
  storage();
  expect(readGuestProfile()).toEqual({ name: "Guest" });
});

test("migrates only a valid explicitly stored legacy name and keeps the legacy key", () => {
  const legacy = JSON.stringify({
    name: "  Taylor  ",
    email: "mock@example.com",
    avatarUrl: "mock",
  });
  const entries = storage({ "dayplan.account.v1": legacy });
  const profile = readGuestProfile();
  expect(profile).toEqual({ name: "Taylor" });
  writeGuestProfile(profile);
  expect(entries.get(GUEST_PROFILE_KEY)).toBe(
    JSON.stringify({ name: "Taylor" }),
  );
  expect(entries.get("dayplan.account.v1")).toBe(legacy);
});

test.each(["bad", "{}", '{"name":" "}', '{"name":42}'])(
  "malformed new profile %s does not resurrect the legacy profile",
  (raw) => {
    storage({
      [GUEST_PROFILE_KEY]: raw,
      "dayplan.account.v1": '{"name":"Legacy"}',
    });
    expect(readGuestProfile()).toEqual({ name: "Guest" });
  },
);

test("unavailable storage is reported to the provider", () => {
  vi.stubGlobal("localStorage", {
    getItem() {
      throw new Error("Blocked");
    },
  });
  expect(() => readGuestProfile()).toThrow("Blocked");
});
