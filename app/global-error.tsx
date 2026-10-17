"use client";

import "./globals.css";

import { ErrorScreen } from "@/components/shared/error-screen";
import { THEME_INIT_SCRIPT } from "@/stores/theme";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
          background: "var(--background)",
          color: "var(--foreground)",
        }}
      >
        <title>Dayplan needs to recover</title>
        <ErrorScreen
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
