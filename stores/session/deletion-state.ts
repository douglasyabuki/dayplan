export const DELETION_EVENT = "dayplan-account-deletion";
export const DELETION_PREFIX = "dayplan.account-deletion.v1:";

export type DeletionMarker = {
  state: "pending" | "unknown" | "deleted" | "clean";
  capability: string;
  attempt: string;
};

export function deletionKey(userId: string) {
  return `${DELETION_PREFIX}${encodeURIComponent(userId)}`;
}

export function readDeletion(userId: string): DeletionMarker | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(deletionKey(userId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const marker = JSON.parse(raw) as DeletionMarker;
    if (
      !["pending", "unknown", "deleted", "clean"].includes(marker.state) ||
      typeof marker.capability !== "string" ||
      typeof marker.attempt !== "string"
    )
      return { state: "unknown", capability: "", attempt: "invalid" };
    return marker;
  } catch {
    return { state: "unknown", capability: "", attempt: "invalid" };
  }
}

export function writeDeletion(userId: string, marker: DeletionMarker) {
  const raw = JSON.stringify(marker);
  localStorage.setItem(deletionKey(userId), raw);
  if (localStorage.getItem(deletionKey(userId)) !== raw)
    throw new Error(
      "Browser coordination is unavailable. Account deletion has not started.",
    );
  window.dispatchEvent(new Event(DELETION_EVENT));
}

export function cancelDeletion(userId: string, attempt: string) {
  if (readDeletion(userId)?.attempt !== attempt) return;
  localStorage.removeItem(deletionKey(userId));
  if (localStorage.getItem(deletionKey(userId)) !== null)
    throw new Error(
      "Account editing is still paused. Retry checking deletion status.",
    );
  window.dispatchEvent(new Event(DELETION_EVENT));
}

export function assertAccountActive(userId: string) {
  if (readDeletion(userId))
    throw new Error(
      "This account is paused for deletion. Check deletion status before continuing.",
    );
}

export function subscribeDeletion(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(DELETION_PREFIX)) listener();
  };
  window.addEventListener(DELETION_EVENT, listener);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(DELETION_EVENT, listener);
    window.removeEventListener("storage", storage);
  };
}
