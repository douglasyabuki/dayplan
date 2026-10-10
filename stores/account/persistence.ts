import { type AccountProfile, mockAccount } from "./model";

const STORAGE_KEY = "dayplan.account.v1";

export function readAccount(): AccountProfile {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return mockAccount;
  try {
    const stored: unknown = JSON.parse(raw);
    if (
      typeof stored === "object" &&
      stored !== null &&
      "name" in stored &&
      typeof stored.name === "string" &&
      stored.name.trim()
    )
      return { ...mockAccount, name: stored.name.trim() };
  } catch {
    // Malformed mock data can safely fall back to the defaults.
  }
  return mockAccount;
}

export function writeAccount(profile: AccountProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: profile.name }));
}
