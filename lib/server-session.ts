import "server-only";

import { getAuth } from "@/lib/auth";

export interface VerifiedAccountContext {
  userId: string;
  sessionId: string;
  profile: { name: string; email: string; avatarUrl: string | undefined };
}

export class SessionAccessError extends Error {
  /**
   * Describes a rejected account session without exposing its token.
   * @param status HTTP authorization failure status.
   * @param message Safe explanation for the browser.
   * @returns {SessionAccessError} An error carrying the response status and message.
   * @example throw new SessionAccessError(401, "Sign in to access your account.");
   */
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Verifies the database session and rejects requests from an obsolete client session.
 * @param request Incoming request carrying cookies and X-Dayplan-Session.
 * @returns {Promise<VerifiedAccountContext>} Database-verified ownership, session identity and minimal profile; throws SessionAccessError for missing or mismatched sessions.
 * @example const { userId } = await requireAccountSession(request);
 */
export async function requireAccountSession(
  request: Request,
): Promise<VerifiedAccountContext> {
  const session = await getAuth().api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (!session)
    throw new SessionAccessError(401, "Sign in to access your account.");
  if (request.headers.get("X-Dayplan-Session") !== session.session.id)
    throw new SessionAccessError(
      403,
      "Your session changed. Refresh before retrying.",
    );
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("Origin");
    if (!origin || origin !== new URL(process.env.BETTER_AUTH_URL!).origin)
      throw new SessionAccessError(403, "The request origin is not allowed.");
  }
  return {
    userId: session.user.id,
    sessionId: session.session.id,
    profile: {
      name: session.user.name,
      email: session.user.email,
      avatarUrl: session.user.image ?? undefined,
    },
  };
}
