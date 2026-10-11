"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { useOnboarding } from "@/stores/onboarding/provider";
import { useSession } from "@/stores/session/provider";

import { WorkspaceLoading } from "./workspace-loading";

export function WorkspaceAccess({ children }: { children: ReactNode }) {
  const session = useSession();
  const onboarding = useOnboarding();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ready = session.status !== "loading" && onboarding.ready;
  useEffect(() => {
    if (ready && !onboarding.accepted) {
      const next =
        pathname + (params.size ? `?${params}` : "") + window.location.hash;
      router.replace(`/welcome?next=${encodeURIComponent(next)}`);
    }
  }, [ready, onboarding.accepted, pathname, params, router]);
  if (!ready || !onboarding.accepted) return <WorkspaceLoading />;
  return children;
}
