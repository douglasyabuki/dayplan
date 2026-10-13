"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import { authClient } from "@/lib/auth-client";
import { safeWorkspaceDestination } from "@/lib/workspace/entry";

import { departureHandler } from "./departure";
import type { Session } from "./model";

const SessionContext = createContext<Session | null>(null);

export type SessionActions = {
  signIn: (destination?: string) => Promise<void>;
  signOut: (onSuccess?: () => void) => Promise<void>;
  switchAccount: (destination?: string) => Promise<void>;
  retry: () => Promise<void>;
  busy: boolean;
  error: string;
  departureBlocked: boolean;
  discardAndLeave: () => Promise<void>;
  retryDeparture: () => Promise<void>;
};

const SessionActionsContext = createContext<SessionActions | null>(null);

export function SessionProvider({
  children,
  value,
}: {
  children: ReactNode;
  value?: Session;
}) {
  // Injected sessions never contact the real authentication service in tests.
  if (value)
    return (
      <SessionContext.Provider value={value}>
        {children}
      </SessionContext.Provider>
    );
  return <LiveSessionProvider>{children}</LiveSessionProvider>;
}

function LiveSessionProvider({ children }: { children: ReactNode }) {
  const query = authClient.useSession();
  const sessionId = query.data?.session.id;
  const refetch = query.refetch;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [departureBlocked, setDepartureBlocked] = useState(false);
  const leaveAction = useRef<(() => Promise<void>) | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    const invalid = (event: Event) => {
      if (
        (event as CustomEvent<{ sessionId: string }>).detail.sessionId ===
        sessionId
      ) {
        flushSync(() => setBusy(true));
        void refetch().finally(() => setBusy(false));
      }
    };
    window.addEventListener("dayplan-session-invalid", invalid);
    return () => window.removeEventListener("dayplan-session-invalid", invalid);
  }, [sessionId, refetch]);
  const session: Session =
    busy || query.isPending
      ? { status: "loading" }
      : query.error
        ? {
            status: "error",
            message: "Your session could not be checked. Please retry.",
          }
        : query.data
          ? {
              status: "authenticated",
              userId: query.data.user.id,
              sessionId: query.data.session.id,
            }
          : { status: "guest" };

  async function run(
    operation: () => Promise<void>,
    leaving = false,
    discard = false,
  ) {
    if (pending.current) return;
    pending.current = true;
    setPreparing(leaving);
    const departure = departureHandler(query.data?.user.id);
    try {
      if (leaving && departure) {
        if (discard) await departure.discard();
        else if (!(await departure.prepare(Date.now() + 10000))) {
          setDepartureBlocked(true);
          leaveAction.current = operation;
          setError(
            "Some edits are neither confirmed by the server nor safely stored for recovery. Retry saving, download a backup, or explicitly discard edits before leaving.",
          );
          departure.resume();
          return;
        }
      }
      setDepartureBlocked(false);
      // Commit the loading boundary and run provider cleanup before cookie changes.
      flushSync(() => {
        setBusy(true);
        setError("");
      });
      await operation();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Authentication failed. Please retry.",
      );
    } finally {
      if (leaving) departure?.resume();
      pending.current = false;
      setPreparing(false);
      setBusy(false);
    }
  }

  async function google(destination?: string) {
    const options = await fetch("/api/auth-options", { cache: "no-store" });
    if (!options.ok || !(await options.json()).google)
      throw new Error(
        "Google sign-in is not configured yet. You can continue as a guest.",
      );
    const callbackURL = safeWorkspaceDestination(
      destination ?? null,
      window.location.origin,
    );
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL,
      errorCallbackURL: `/sign-in?authError=1&next=${encodeURIComponent(callbackURL)}`,
    });
    if (result.error)
      throw new Error("Google sign-in could not start. Please retry.");
  }

  async function logout() {
    const result = await authClient.signOut();
    if (result.error)
      throw new Error(
        "Sign-out failed. Your account is still signed in. Please retry.",
      );
    await query.refetch();
  }

  const actions: SessionActions = {
    busy: busy || preparing,
    error,
    departureBlocked,
    retryDeparture: async () => {
      const operation = leaveAction.current;
      if (operation) await run(operation, true);
    },
    discardAndLeave: async () => {
      const operation = leaveAction.current;
      if (operation) await run(operation, true, true);
    },
    signIn: (destination) => run(() => google(destination)),
    signOut: (onSuccess) =>
      run(async () => {
        await logout();
        onSuccess?.();
      }, true),
    switchAccount: (destination) =>
      run(async () => {
        await logout();
        await google(destination);
      }, true),
    retry: () =>
      run(async () => {
        await query.refetch();
      }),
  };

  return (
    <SessionActionsContext.Provider value={actions}>
      <SessionContext.Provider value={session}>
        {children}
      </SessionContext.Provider>
    </SessionActionsContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("SessionProvider is required");
  return session;
}

export function useSessionActions(): SessionActions | null {
  return useContext(SessionActionsContext);
}
