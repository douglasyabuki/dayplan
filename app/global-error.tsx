"use client";

import "./globals.css";

import { RecoveryScreen } from "@/components/shared/recovery-screen";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
          colorScheme: "light dark",
          background: "Canvas",
          color: "CanvasText",
        }}
      >
        <title>Dayplan needs to recover</title>
        <RecoveryScreen
          title="Dayplan needs to recover"
          description="Try again, or open Welcome to return to a usable workspace. This screen cannot confirm unsaved work is protected. Browser recovery may be available when the workspace opens; do not clear browser data."
          reference={error.digest}
          retry={retry}
          broad
        />
      </body>
    </html>
  );
}
