import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthScreen } from "@/components/account/auth-screen";

export const metadata: Metadata = { title: "Sign up | Dayplan" };

export default function SignUpPage() {
  return (
    <Suspense fallback={<p role="status">Loading sign up…</p>}>
      <AuthScreen mode="sign-up" />
    </Suspense>
  );
}
