import { Suspense } from "react";

import { DayplanLoading } from "@/components/shared/dayplan-loading";
import { Welcome } from "@/components/welcome/welcome";

export default function WelcomePage() {
  return (
    <Suspense fallback={<DayplanLoading fullScreen />}>
      <Welcome />
    </Suspense>
  );
}
