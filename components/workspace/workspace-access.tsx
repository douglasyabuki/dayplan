"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { SessionError } from "@/components/account/auth-controls";
import { useOnboarding } from "@/stores/onboarding/provider";
import { useSession } from "@/stores/session/provider";

import { WorkspaceLoading } from "./workspace-loading";

export function WorkspaceAccess({ children }: { children: ReactNode }) {
  const session = useSession();
  const onboarding = useOnboarding();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ready =
    session.status === "authenticated" ||
    (session.status === "guest" && onboarding.ready);
  useEffect(() => {
    if (ready && session.status === "guest" && !onboarding.accepted) {
      const next =
        pathname + (params.size ? `?${params}` : "") + window.location.hash;
      router.replace(`/welcome?next=${encodeURIComponent(next)}`);
    }
  }, [ready, session.status, onboarding.accepted, pathname, params, router]);
  if (session.status === "error")
    return <SessionError message={session.message} />;
  if (!ready || (session.status === "guest" && !onboarding.accepted))
    return <WorkspaceLoading />;
  return children;
}
