export const GUEST_DATA_EVENT = "dayplan-guest-data-changed";

export function notifyGuestDataChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GUEST_DATA_EVENT));
  }
}
