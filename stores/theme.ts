export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "dayplan.theme";
export const THEME_CHANGE_EVENT = "dayplan:theme-change";

// This runs before paint in both documents, without depending on a provider.
export const THEME_INIT_SCRIPT = `(() => {
  window.__dayplanThemeCleanup?.();
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let theme = "system";
  const valid = value => ["light", "dark", "system"].includes(value);
  const read = () => {
    try {
      const saved = localStorage.getItem("${THEME_STORAGE_KEY}");
      const candidate = saved ?? JSON.parse(localStorage.getItem("dayplan.workspace.v2") || "null")?.theme;
      theme = valid(candidate) ? candidate : "system";
    } catch {}
  };
  const apply = () => {
    const dark = theme === "dark" || (theme === "system" && media.matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  };
  const onPreference = event => {
    if (valid(event.detail)) theme = event.detail;
    apply();
  };
  const onStorage = event => {
    if (event.key === "${THEME_STORAGE_KEY}" || event.key === "dayplan.workspace.v2" || event.key === null) {
      read();
      apply();
    }
  };
  read();
  apply();
  media.addEventListener("change", apply);
  window.addEventListener("${THEME_CHANGE_EVENT}", onPreference);
  window.addEventListener("storage", onStorage);
  window.__dayplanThemeCleanup = () => {
    media.removeEventListener("change", apply);
    window.removeEventListener("${THEME_CHANGE_EVENT}", onPreference);
    window.removeEventListener("storage", onStorage);
  };
})();`;

export function applyThemePreference(theme: ThemePreference) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function rememberThemePreference(theme: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The active theme still works when browser storage is unavailable.
  }
  applyThemePreference(theme);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }));
}
