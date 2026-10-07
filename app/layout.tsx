import "./globals.css";

import { cn } from "cn";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Toaster } from "@/components/ui/toast";

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
        {/* Apply the system theme before paint; saved preferences take over after hydration. */}
        <script>
          {`document.documentElement.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches);`}
        </script>
      </head>
      <body className="app-scrollbar flex min-h-full flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
