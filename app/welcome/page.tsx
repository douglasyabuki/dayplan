import { Suspense } from "react";

import { Welcome } from "@/components/welcome/welcome";

export default function WelcomePage() {
  return (
    <Suspense fallback={<p role="status">Loading Dayplan…</p>}>
      <Welcome />
    </Suspense>
  );
}
