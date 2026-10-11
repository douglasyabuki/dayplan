"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

export const ONBOARDING_KEY = "dayplan.onboarding.v1";

type Onboarding = {
  ready: boolean;
  accepted: boolean;
  storageError: boolean;
  continueAsGuest: () => void;
};
const OnboardingContext = createContext<Onboarding | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({
    ready: false,
    accepted: false,
    storageError: false,
  });
  useEffect(() => {
    let accepted = false;
    let storageError = false;
    try {
      accepted = localStorage.getItem(ONBOARDING_KEY) === "complete";
    } catch {
      storageError = true;
    }
    // Resolve browser-only onboarding after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ ready: true, accepted, storageError });
  }, []);

  function continueAsGuest() {
    let storageError = false;
    try {
      localStorage.setItem(ONBOARDING_KEY, "complete");
    } catch {
      storageError = true;
    }
    setState({ ready: true, accepted: true, storageError });
  }

  return (
    <OnboardingContext.Provider value={{ ...state, continueAsGuest }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const onboarding = useContext(OnboardingContext);
  if (!onboarding) throw new Error("OnboardingProvider is required");
  return onboarding;
}
