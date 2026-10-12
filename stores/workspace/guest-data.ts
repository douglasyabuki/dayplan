import { GUEST_PROFILE_KEY, LEGACY_KEY } from "@/stores/account/persistence";
import { notifyGuestDataChanged } from "@/stores/persistence/guest-events";
import type { Workspace } from "@/types-and-constants/workspace";

import { readWorkspace, STORAGE_KEY } from "./persistence";
import { validateWorkspace } from "./validation";

export type GuestData = {
  snapshot: Workspace | null;
  profiles: Partial<
    Record<typeof GUEST_PROFILE_KEY | typeof LEGACY_KEY, string | null>
  >;
};

export type GuestImportOperation = {
  snapshot: Workspace;
  expectedRevision: number;
  confirmedHistoryToken: string;
};

export type GuestCleanupJournal = {
  target: GuestData;
  operation?: GuestImportOperation;
  confirmed: boolean;
};

export function guestCleanupKey(userId: string) {
  return `dayplan.guest-cleanup.v1:${encodeURIComponent(userId)}`;
}

// Match content rather than serialization order, including legacy tag defaults.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, field]) => `${JSON.stringify(key)}:${canonical(field)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sameGuestWorkspace(a: Workspace, b: Workspace) {
  return canonical(validateWorkspace(a)) === canonical(validateWorkspace(b));
}

export function readGuestData(): GuestData {
  return {
    snapshot: readWorkspace(),
    profiles: {
      [GUEST_PROFILE_KEY]: localStorage.getItem(GUEST_PROFILE_KEY),
      [LEGACY_KEY]: localStorage.getItem(LEGACY_KEY),
    },
  };
}

export function readGuestCleanup(userId: string): GuestCleanupJournal | null {
  const raw = localStorage.getItem(guestCleanupKey(userId));
  if (raw === null) return null;
  const value = JSON.parse(raw) as GuestCleanupJournal;
  if (
    !value ||
    typeof value.confirmed !== "boolean" ||
    !value.target ||
    !value.target.profiles ||
    Object.keys(value.target.profiles).some(
      (key) => key !== GUEST_PROFILE_KEY && key !== LEGACY_KEY,
    ) ||
    Object.values(value.target.profiles).some(
      (field) => field !== null && typeof field !== "string",
    )
  )
    throw new Error(
      "Guest cleanup information could not be read. Guest data has been kept.",
    );
  value.target.snapshot =
    value.target.snapshot === null
      ? null
      : validateWorkspace(value.target.snapshot);
  if (value.operation) {
    if (
      !Number.isSafeInteger(value.operation.expectedRevision) ||
      value.operation.expectedRevision < 0 ||
      typeof value.operation.confirmedHistoryToken !== "string" ||
      !value.target.snapshot ||
      !sameGuestWorkspace(value.operation.snapshot, value.target.snapshot)
    )
      throw new Error("Guest import recovery information could not be read.");
  }
  return value;
}

export function writeGuestCleanup(
  userId: string,
  journal: GuestCleanupJournal,
) {
  const raw = JSON.stringify(journal);
  const key = guestCleanupKey(userId);
  localStorage.setItem(key, raw);
  if (localStorage.getItem(key) !== raw) {
    throw new Error(
      "Guest import recovery information could not be saved. Guest data has been kept; import has not started.",
    );
  }
}

/** Deletes only unchanged targets. Failures are distinct from preserved newer data. */
export function cleanupGuestData(target: GuestData): {
  error: string;
  changed: boolean;
} {
  let failed = false;
  let changed = false;
  try {
    const current = readWorkspace();
    if (
      current &&
      target.snapshot &&
      sameGuestWorkspace(current, target.snapshot)
    ) {
      localStorage.removeItem(STORAGE_KEY);
      if (localStorage.getItem(STORAGE_KEY) !== null) failed = true;
    } else if (current) changed = true;
  } catch {
    failed = true;
  }
  for (const key of [GUEST_PROFILE_KEY, LEGACY_KEY] as const) {
    if (!Object.hasOwn(target.profiles, key)) continue;
    const raw = target.profiles[key];
    try {
      const current = localStorage.getItem(key);
      if (current !== null && current === raw) {
        localStorage.removeItem(key);
        if (localStorage.getItem(key) !== null) failed = true;
      } else if (current !== null && current !== raw) changed = true;
    } catch {
      failed = true;
    }
  }
  notifyGuestDataChanged();
  return {
    error: failed
      ? "Guest data could not be completely deleted from this browser. Retry cleanup; your account data is safe."
      : "",
    changed,
  };
}

/** Discard requires the entire reviewed set to match before any deletion. */
export function sameGuestData(current: GuestData, target: GuestData) {
  return (
    (current.snapshot === null) === (target.snapshot === null) &&
    (!current.snapshot ||
      !target.snapshot ||
      sameGuestWorkspace(current.snapshot, target.snapshot)) &&
    canonical(current.profiles) === canonical(target.profiles)
  );
}

export function discardGuestData(target: GuestData) {
  if (!sameGuestData(readGuestData(), target)) {
    return {
      error: "Guest data changed. Review it and confirm discarding again.",
      changed: true,
    };
  }
  return cleanupGuestData(target);
}
