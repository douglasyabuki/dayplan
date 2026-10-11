"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { isPromise, serialized } from "@/stores/persistence/queue";

import {
  type AccountProfile,
  guestProfile,
  type ProfileUpdateStatus,
} from "./model";
import type { ProfileDataSource } from "./persistence";

type AccountContextValue = {
  profile: AccountProfile;
  ready: boolean;
  storageError: boolean;
  updateStatus: ProfileUpdateStatus;
  updateError: string;
  capabilities: { hasAccount: boolean; persistence: "browser" | "database" };
  updateName: (name: string) => Promise<boolean>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({
  children,
  dataSource,
}: {
  children: ReactNode;
  dataSource: ProfileDataSource;
}) {
  const [account, setAccount] = useState({
    profile: guestProfile,
    ready: false,
    storageError: false,
  });
  const [updateStatus, setUpdateStatus] = useState<ProfileUpdateStatus>("idle");
  const [updateError, setUpdateError] = useState("");
  const current = useRef(guestProfile);
  const scope = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const hasAccount = dataSource.owner.kind === "account";

  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller;
    const signal = controller.signal;
    const failed = () => {
      if (!signal.aborted)
        setAccount({
          profile: current.current,
          ready: true,
          storageError: true,
        });
    };
    const loaded = (profile: AccountProfile) => {
      if (signal.aborted) return;
      current.current = profile;
      setAccount({ profile, ready: true, storageError: false });
      // Establish the separate guest profile key, including legacy-name migration.
      if (!hasAccount) {
        try {
          const result = serialized(dataSource, signal, () =>
            dataSource.save(profile, signal),
          );
          if (isPromise(result)) void result.catch(failed);
        } catch {
          failed();
        }
      }
    };
    try {
      const result = serialized(dataSource, signal, () =>
        dataSource.load(signal),
      );
      if (isPromise(result)) void result.then(loaded, failed);
      else loaded(result);
    } catch {
      failed();
    }
    return () => controller.abort();
  }, [dataSource, hasAccount]);

  async function updateName(value: string): Promise<boolean> {
    const controller = scope.current;
    const name = value.trim();
    if (
      !controller ||
      controller.signal.aborted ||
      !account.ready ||
      !name ||
      pending.current
    )
      return false;
    if (name === current.current.name) return true;
    const profile = { ...current.current, name };
    pending.current = true;
    setUpdateStatus("pending");
    setUpdateError("");
    let storageError = false;
    try {
      await serialized(dataSource, controller.signal, () =>
        dataSource.save(profile, controller.signal),
      );
    } catch {
      if (controller.signal.aborted) return false;
      storageError = true;
      if (hasAccount) {
        pending.current = false;
        setUpdateStatus("error");
        setUpdateError("Your name could not be saved. Please try again.");
        return false;
      }
    }
    if (controller.signal.aborted) return false;
    pending.current = false;
    current.current = profile;
    setAccount({ profile, ready: true, storageError });
    setUpdateStatus(storageError ? "error" : "success");
    return true;
  }

  return (
    <AccountContext.Provider
      value={{
        ...account,
        updateStatus,
        updateError,
        capabilities: {
          hasAccount,
          persistence: hasAccount ? "database" : "browser",
        },
        updateName,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error("AccountProvider is required");
  return account;
}
