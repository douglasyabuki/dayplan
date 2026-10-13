import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthScreen } from "@/components/account/auth-screen";
import { DayplanLoading } from "@/components/shared/dayplan-loading";

export const metadata: Metadata = { title: "Sign up | Dayplan" };

export default function SignUpPage() {
  return (
    <Suspense
      fallback={<DayplanLoading fullScreen message="Preparing sign up…" />}
    >
      <AuthScreen mode="sign-up" />
    </Suspense>
  );
}
