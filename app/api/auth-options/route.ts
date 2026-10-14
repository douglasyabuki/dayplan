import { githubSignInConfigured, googleSignInConfigured } from "@/lib/auth";

export function GET(): Response {
  return Response.json(
    { google: googleSignInConfigured(), github: githubSignInConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
