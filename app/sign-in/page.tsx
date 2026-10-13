import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthScreen } from "@/components/account/auth-screen";
import { DayplanLoading } from "@/components/shared/dayplan-loading";

export const metadata: Metadata = { title: "Sign in | Dayplan" };

export default function SignInPage() {
  return (
    <Suspense
      fallback={<DayplanLoading fullScreen message="Preparing sign in…" />}
    >
      <AuthScreen mode="sign-in" />
    </Suspense>
  );
}
