import { runInNewContext } from "node:vm";

import { expect, test, vi } from "vitest";

import {
  THEME_CHANGE_EVENT,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from "@/stores/theme";

function themeDocument(saved: string | null, systemDark: boolean) {
  const storage = new Map<string, string>();
  if (saved !== null) storage.set(THEME_STORAGE_KEY, saved);
  const classes = new Set<string>();
  const root = {
    classList: {
      toggle: vi.fn((name: string, enabled: boolean) => {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }),
    },
    style: { colorScheme: "" },
  };
  const media = Object.assign(new EventTarget(), { matches: systemDark });
  const window = Object.assign(new EventTarget(), {
    matchMedia: () => media,
    __dayplanThemeCleanup: undefined as (() => void) | undefined,
  });
  const localStorage = {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
  };
  return {
    storage,
    media,
    window,
    localStorage,
    root,
    dark: () => classes.has("dark"),
    run: () =>
      runInNewContext(THEME_INIT_SCRIPT, {
        window,
        document: { documentElement: root },
        localStorage,
      }),
  };
}

test.each([
  { saved: "light", systemDark: true, expectedDark: false },
  { saved: "dark", systemDark: false, expectedDark: true },
  { saved: "system", systemDark: true, expectedDark: true },
  { saved: "system", systemDark: false, expectedDark: false },
  { saved: null, systemDark: true, expectedDark: true },
  { saved: "invalid", systemDark: false, expectedDark: false },
])(
  "bootstrap applies $saved with system dark=$systemDark before React mounts",
  ({ saved, systemDark, expectedDark }) => {
    const page = themeDocument(saved, systemDark);
    page.run();
    expect(page.dark()).toBe(expectedDark);
    expect(page.root.style.colorScheme).toBe(expectedDark ? "dark" : "light");
  },
);

test("system changes update system mode while a picked theme stays fixed", () => {
  const page = themeDocument("system", false);
  page.run();
  page.media.matches = true;
  page.media.dispatchEvent(new Event("change"));
  expect(page.dark()).toBe(true);

  page.window.dispatchEvent(
    new CustomEvent(THEME_CHANGE_EVENT, { detail: "light" }),
  );
  expect(page.dark()).toBe(false);
  page.media.dispatchEvent(new Event("change"));
  expect(page.dark()).toBe(false);
});

test("a global error document replaces bootstrap listeners and follows other tabs", () => {
  const page = themeDocument("system", false);
  page.run();
  page.run();
  page.root.classList.toggle.mockClear();
  page.media.matches = true;
  page.media.dispatchEvent(new Event("change"));
  expect(page.dark()).toBe(true);
  expect(page.root.classList.toggle).toHaveBeenCalledOnce();

  page.storage.set(THEME_STORAGE_KEY, "light");
  page.window.dispatchEvent(
    Object.assign(new Event("storage"), { key: THEME_STORAGE_KEY }),
  );
  expect(page.dark()).toBe(false);
});

test("existing workspace preference is available without loading its provider", () => {
  const page = themeDocument(null, false);
  page.storage.set("dayplan.workspace.v2", JSON.stringify({ theme: "dark" }));
  page.run();
  expect(page.dark()).toBe(true);
});

test.each(["blocked", "corrupt"])(
  "%s storage falls back to the system theme",
  (kind) => {
    const page = themeDocument(null, true);
    if (kind === "blocked")
      page.localStorage.getItem.mockImplementation(() => {
        throw new Error("Storage unavailable");
      });
    else page.storage.set("dayplan.workspace.v2", "invalid JSON");
    expect(() => page.run()).not.toThrow();
    expect(page.dark()).toBe(true);
  },
);
