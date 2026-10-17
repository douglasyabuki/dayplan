"use client";

import { ErrorScreen } from "@/components/shared/error-screen";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorScreen
      title="Dayplan could not open this page"
      description="Try again or return to your workspace. Saved data has not been intentionally reset. Some unsaved work may need recovery after a page failure; check Data settings before replacing data."
      reference={error.digest}
      retry={retry}
      broad
    />
  );
}
