export type DepartureHandler = {
  prepare: (deadline: number) => Promise<boolean>;
  resume: () => void;
  discard: () => Promise<void>;
};

// Workspace providers are below the session provider; use an owner-bound registry
// so every sign-out entry point shares the same gate without a Context cycle.
const handlers = new Map<string, DepartureHandler>();

export function registerDeparture(userId: string, handler: DepartureHandler) {
  handlers.set(userId, handler);
  return () => {
    if (handlers.get(userId) === handler) handlers.delete(userId);
  };
}

export function departureHandler(userId: string | undefined) {
  return userId ? handlers.get(userId) : undefined;
}
