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

import { AccountDeletionGuard } from "@/components/account/account-deletion-guard";
import { authClient } from "@/lib/auth-client";
import { navigateToSignIn } from "@/lib/auth-navigation";
import { safeWorkspaceDestination } from "@/lib/workspace/entry";
import { type AuthProvider, providerNames } from "@/types-and-constants/auth";

import {
  beginAccountDeletion,
  checkAccountDeletionEligibility,
} from "./account-deletion";
import { readDeletion } from "./deletion-state";
import { departureHandler } from "./departure";
import type { Session } from "./model";

const SessionContext = createContext<Session | null>(null);

export type SessionActions = {
  checkDeletionEligibility: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  reauthenticateDeletion: () => Promise<void>;
  signIn: (provider: AuthProvider, destination?: string) => Promise<void>;
  connect: (
    provider: AuthProvider,
    callbackURL: string,
    errorCallbackURL: string,
    beforeDeparture?: () => Promise<boolean>,
  ) => Promise<void>;
  pendingAction: { kind: "sign-in" | "connect"; provider: AuthProvider } | null;
  requiresReauthentication: boolean;
  signOut: (
    onSuccess?: () => void,
    beforeDeparture?: () => Promise<boolean>,
  ) => Promise<void>;
  switchAccount: (
    destination?: string,
    beforeDeparture?: () => Promise<boolean>,
  ) => Promise<void>;
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
  const [pendingAction, setPendingAction] =
    useState<SessionActions["pendingAction"]>(null);
  const [requiresReauthentication, setRequiresReauthentication] =
    useState(false);
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [departureBlocked, setDepartureBlocked] = useState(false);
  const leaveAction = useRef<{
    operation: () => Promise<void>;
    preserveSession: boolean;
    beforeDeparture?: () => Promise<boolean>;
  } | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    const invalid = (event: Event) => {
      if (
        (event as CustomEvent<{ sessionId: string }>).detail.sessionId ===
        sessionId
      ) {
        if (query.data?.user.id && readDeletion(query.data.user.id)) return;
        flushSync(() => setBusy(true));
        void refetch().finally(() => setBusy(false));
      }
    };
    window.addEventListener("dayplan-session-invalid", invalid);
    return () => window.removeEventListener("dayplan-session-invalid", invalid);
  }, [sessionId, refetch, query.data?.user.id]);
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
    preserveSession = false,
    beforeDeparture?: () => Promise<boolean>,
  ) {
    if (pending.current) return;
    pending.current = true;
    setPreparing(leaving);
    const departure = departureHandler(query.data?.user.id);
    try {
      if (beforeDeparture && !(await beforeDeparture())) return;
      if (leaving && departure) {
        if (discard) await departure.discard();
        else if (!(await departure.prepare(Date.now() + 10000))) {
          setDepartureBlocked(true);
          leaveAction.current = { operation, preserveSession, beforeDeparture };
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
        if (!preserveSession) setBusy(true);
        setError("");
        setRequiresReauthentication(false);
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
      setPendingAction(null);
    }
  }

  async function social(provider: AuthProvider, destination?: string) {
    const options = await fetch("/api/auth-options", { cache: "no-store" });
    if (!options.ok || !(await options.json())[provider])
      throw new Error(
        `${providerNames[provider]} sign-in is not configured yet. You can continue as a guest.`,
      );
    const callbackURL = safeWorkspaceDestination(
      destination ?? null,
      window.location.origin,
    );
    const result = await authClient.signIn.social({
      provider,
      callbackURL,
      errorCallbackURL: `/sign-in?authError=1&provider=${provider}&next=${encodeURIComponent(callbackURL)}`,
    });
    if (result.error)
      throw new Error(
        `${providerNames[provider]} sign-in could not start. Please retry.`,
      );
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
    checkDeletionEligibility: async () => {
      if (pending.current || !query.data)
        throw new Error("Wait for the current account action to finish.");
      pending.current = true;
      try {
        await checkAccountDeletionEligibility(query.data.session.id);
      } finally {
        pending.current = false;
      }
    },
    reauthenticateDeletion: () =>
      run(async () => {
        await logout();
        navigateToSignIn("/today?settings=account");
      }),
    deleteAccount: async () => {
      if (pending.current || !query.data)
        throw new Error("Wait for the current account action to finish.");
      pending.current = true;
      try {
        await beginAccountDeletion(query.data.user.id, query.data.session.id);
      } finally {
        pending.current = false;
      }
    },
    busy: busy || preparing,
    pendingAction,
    requiresReauthentication,
    error,
    departureBlocked,
    retryDeparture: async () => {
      const departure = leaveAction.current;
      if (departure)
        await run(
          departure.operation,
          true,
          false,
          departure.preserveSession,
          departure.beforeDeparture,
        );
    },
    discardAndLeave: async () => {
      const departure = leaveAction.current;
      if (departure)
        await run(
          departure.operation,
          true,
          true,
          departure.preserveSession,
          departure.beforeDeparture,
        );
    },
    signIn: (provider, destination) =>
      run(async () => {
        setPendingAction({ kind: "sign-in", provider });
        await social(provider, destination);
      }),
    connect: (provider, callbackURL, errorCallbackURL, beforeDeparture) =>
      run(
        async () => {
          setPendingAction({ kind: "connect", provider });
          const result = await authClient.linkSocial({
            provider,
            callbackURL,
            errorCallbackURL,
          });
          if (result.error) {
            setRequiresReauthentication(result.error.status === 401);
            throw new Error(
              `${providerNames[provider]} connection could not start. Please sign in again or retry.`,
            );
          }
        },
        true,
        false,
        true,
        beforeDeparture,
      ),
    signOut: (onSuccess, beforeDeparture) =>
      run(
        async () => {
          await logout();
          onSuccess?.();
        },
        true,
        false,
        false,
        beforeDeparture,
      ),
    switchAccount: (destination, beforeDeparture) =>
      run(
        async () => {
          await logout();
          const callbackURL = safeWorkspaceDestination(
            destination ??
              window.location.pathname +
                window.location.search +
                window.location.hash,
            window.location.origin,
          );
          navigateToSignIn(callbackURL);
        },
        true,
        false,
        false,
        beforeDeparture,
      ),
    retry: () =>
      run(async () => {
        await query.refetch();
      }),
  };

  return (
    <SessionActionsContext.Provider value={actions}>
      <SessionContext.Provider value={session}>
        {children}
        <AccountDeletionGuard />
      </SessionContext.Provider>
    </SessionActionsContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("SessionProvider is required");
  return session;
}

export function useOptionalSession(): Session | null {
  return useContext(SessionContext);
}

export function useSessionActions(): SessionActions | null {
  return useContext(SessionActionsContext);
}
