"use client";

import { ErrorScreen } from "@/components/shared/error-screen";

export default function WorkspaceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorScreen
      title="This workspace view could not load"
      description="Try again or open Today. Your workspace has not been reset. Review save and recovery status before reloading or replacing local edits."
      reference={error.digest}
      retry={retry}
    />
  );
}
