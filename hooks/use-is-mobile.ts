import * as React from "react";

const MOBILE_BREAKPOINT = 768;

const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(callback: () => void) {
  const mediaQuery = window.matchMedia(query);

  mediaQuery.addEventListener("change", callback);

  return () => {
    mediaQuery.removeEventListener("change", callback);
  };
}

function getSnapshot() {
  return window.matchMedia(query).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * Reports whether the viewport is narrower than the mobile breakpoint.
 * @returns {boolean} True when the viewport is narrower than 768 pixels; otherwise false. The server snapshot is false.
 * @example
 * const isMobile = useIsMobile();
 * return isMobile ? <MobileNav /> : <DesktopNav />;
 */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
