import "server-only";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { getPrisma } from "@/lib/prisma";

/**
 * Reports whether Google sign-in has its required server settings.
 * @returns {boolean} True when both Google credentials, the auth secret, and base URL are configured.
 * @example if (!googleSignInConfigured()) return Response.json({ available: false });
 */
export function googleSignInConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_URL,
  );
}

let instance: ReturnType<typeof betterAuth> | undefined;

/**
 * Creates the server-only authentication service on first use.
 * @returns {ReturnType<typeof betterAuth>} The shared database-backed auth service; throws when core settings are absent.
 * @example const session = await getAuth().api.getSession({ headers: request.headers });
 */
export function getAuth(): ReturnType<typeof betterAuth> {
  if (instance) return instance;
  if (!process.env.BETTER_AUTH_SECRET || !process.env.BETTER_AUTH_URL)
    throw new Error("Authentication server settings are not configured.");
  const options: BetterAuthOptions = {
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    socialProviders: googleSignInConfigured()
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            prompt: "select_account",
          },
        }
      : {},
    session: { cookieCache: { enabled: false } },
    logger: { disabled: true },
  };
  instance = betterAuth(options);
  return instance;
}
