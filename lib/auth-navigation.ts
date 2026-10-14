/**
 * Opens the provider chooser after a protected account departure.
 * @param destination Validated workspace path to return to after authentication.
 * @returns {void} Starts navigation to the sign-in screen.
 * @example navigateToSignIn("/inbox") opens the chooser with an inbox return destination.
 */
export function navigateToSignIn(destination: string): void {
  // A full navigation releases the departing account's in-memory recovery state.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/sign-in?next=${encodeURIComponent(destination)}`);
}
