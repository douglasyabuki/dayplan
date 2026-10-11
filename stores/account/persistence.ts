import { guestOwner, type WorkspaceOwner } from "@/stores/session/model";

import { type AccountProfile, guestProfile } from "./model";

export const GUEST_PROFILE_KEY = "dayplan.guest-profile.v1";
const LEGACY_KEY = "dayplan.account.v1";

/** Stable, owner-bound profile adapter; reuse the instance for returning owners. */
export interface ProfileDataSource {
  readonly owner: WorkspaceOwner;
  load(signal: AbortSignal): AccountProfile | Promise<AccountProfile>;
  save(profile: AccountProfile, signal: AbortSignal): void | Promise<void>;
}

function storedName(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      typeof value.name === "string"
    ) {
      return value.name.trim() || null;
    }
  } catch {
    /* Ignore malformed profile data. */
  }
  return null;
}

export function readGuestProfile(): AccountProfile {
  const raw = localStorage.getItem(GUEST_PROFILE_KEY);
  const name = storedName(
    raw === null ? localStorage.getItem(LEGACY_KEY) : raw,
  );
  return name ? { name } : guestProfile;
}

export function writeGuestProfile(profile: AccountProfile) {
  localStorage.setItem(
    GUEST_PROFILE_KEY,
    JSON.stringify({ name: profile.name }),
  );
}

export const guestProfileDataSource: ProfileDataSource = {
  owner: guestOwner,
  load(signal) {
    signal.throwIfAborted();
    return readGuestProfile();
  },
  save(profile, signal) {
    signal.throwIfAborted();
    writeGuestProfile(profile);
  },
};
