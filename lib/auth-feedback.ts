import { type AuthProvider, providerNames } from "@/types-and-constants/auth";

/**
 * Maps authentication errors to safe, actionable copy without exposing provider responses.
 * @param code Better Auth error code, or null for an unspecified failure.
 * @param provider Selected identity provider, when known.
 * @returns {string} A user-facing message with a recovery action.
 * @example authErrorMessage("email_not_found", "github") instructs the user to add an email.
 */
export function authErrorMessage(
  code: string | null,
  provider?: AuthProvider,
): string {
  const name = provider ? providerNames[provider] : "your provider";
  switch (code?.toLowerCase()) {
    case "email_not_verified":
    case "unable_to_link_account":
    case "account_not_linked":
      return `We couldn’t connect this account. Verify your email with ${name}, then try again.`;
    case "email_not_found":
      return `No email was available from ${name}. Add and verify an email with ${name}, then try again.`;
    case "account_already_linked_to_different_user":
    case "account_ownership_conflict":
      return "This sign-in method is already connected to another Dayplan account. Sign in to that account or choose another identity.";
    case "session_not_fresh":
    case "unauthorized":
      return "Please sign in again before managing connected accounts.";
    case "failed_to_unlink_last_account":
      return "Keep at least one sign-in method connected.";
    default:
      return `${provider ? providerNames[provider] + " sign-in" : "Sign-in"} was not completed. Please try again.`;
  }
}

/**
 * Narrows an untrusted query value to a supported identity provider.
 * @param value Provider query parameter.
 * @returns {AuthProvider | undefined} The supported provider, or undefined for unknown values.
 * @example parseAuthProvider("github") returns "github".
 */
export function parseAuthProvider(
  value: string | null,
): AuthProvider | undefined {
  return value === "google" || value === "github" ? value : undefined;
}
