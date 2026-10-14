export type AuthProvider = "google" | "github";

export const authProviders = ["google", "github"] as const;
export const providerNames: Record<AuthProvider, string> = {
  google: "Google",
  github: "GitHub",
};
