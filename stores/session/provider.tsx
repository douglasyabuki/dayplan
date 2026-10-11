"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import type { Session } from "./model";

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({
  children,
  value,
}: {
  children: ReactNode;
  value?: Session;
}) {
  const [session, setSession] = useState<Session>({ status: "loading" });
  useEffect(() => {
    // Resolve browser access after hydration; authentication is a later phase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession({ status: "guest" });
  }, []);
  return (
    <SessionContext.Provider value={value ?? session}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("SessionProvider is required");
  return session;
}
