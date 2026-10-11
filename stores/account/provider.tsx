"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { type AccountProfile, mockAccount } from "./model";
import { readAccount, writeAccount } from "./persistence";

type AccountContextValue = {
  profile: AccountProfile;
  ready: boolean;
  storageError: boolean;
  updateName: (name: string) => boolean;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState({
    profile: mockAccount,
    ready: false,
    storageError: false,
  });
  const current = useRef(mockAccount);

  useEffect(() => {
    let profile = mockAccount;
    let storageError = false;
    try {
      profile = readAccount();
    } catch {
      storageError = true;
    }
    current.current = profile;
    // Hydrate this independent account store from browser storage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccount({ profile, ready: true, storageError });
  }, []);

  function updateName(value: string) {
    const name = value.trim();
    if (!account.ready || !name) return false;
    if (name === current.current.name) return true;
    const profile = { ...current.current, name };
    let storageError = false;
    try {
      writeAccount(profile);
    } catch {
      storageError = true;
    }
    current.current = profile;
    setAccount({ profile, ready: true, storageError });
    return true;
  }

  return (
    <AccountContext.Provider value={{ ...account, updateName }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error("AccountProvider is required");
  return account;
}
