import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthScreen } from "@/components/account/auth-screen";

export const metadata: Metadata = { title: "Sign in | Dayplan" };

export default function SignInPage() {
  return (
    <Suspense fallback={<p role="status">Loading sign in…</p>}>
      <AuthScreen mode="sign-in" />
    </Suspense>
  );
}
