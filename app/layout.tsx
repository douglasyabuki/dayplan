import "./globals.css";

import { cn } from "cn";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Toaster } from "@/components/ui/toast";
import { OnboardingProvider } from "@/stores/onboarding/provider";
import { SessionProvider } from "@/stores/session/provider";
import { THEME_INIT_SCRIPT } from "@/stores/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dayplan — Make room for what matters",
  description:
    "A thoughtful space for your tasks, projects, and everyday plans.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        geistSans.variable,
        geistMono.variable,
        "h-full antialiased",
      )}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="app-scrollbar flex min-h-full flex-col">
        <SessionProvider>
          <OnboardingProvider>{children}</OnboardingProvider>
        </SessionProvider>
        <Toaster />
      </body>
    </html>
  );
}
