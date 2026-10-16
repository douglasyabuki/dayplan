import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Account deletion and backups | Dayplan",
};

const guidance = [
  [
    "Back up and restore",
    "Settings → Data can download a JSON backup of your current workspace, including committed edits waiting to sync. Open editor drafts and profile details are excluded: save or review drafts first. Restoring a backup replaces the current workspace after confirmation. Download a copy before replacing or clearing data.",
  ],
  [
    "Delete an account",
    "Settings → Account validates your current session before showing permanent deletion confirmation and the backup option. If your session has expired, sign in to the same account, then review a fresh confirmation and type DELETE. Deletion never starts automatically after sign-in. This removes active account data, connected sign-in methods, all sessions, and this browser’s account recovery records. Independent guest plans and other accounts are kept. Your Google or GitHub account is unaffected. Downloaded backups and copies on other devices are outside this browser’s cleanup. Deletion cannot be undone.",
  ],
] as const;

export default function HelpPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold">Account deletion and backups</h1>
        <p className="text-muted-foreground">
          Back up your workspace and safely manage account deletion.
        </p>
        <nav aria-label="Help navigation" className="flex flex-wrap gap-4">
          <Link href="/today" className="underline">
            Back to Today
          </Link>
          <Link href="/welcome" className="underline">
            Welcome
          </Link>
        </nav>
      </header>
      {guidance.map(([title, description]) => (
        <section key={title} className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="text-muted-foreground leading-relaxed">{description}</p>
        </section>
      ))}
    </main>
  );
}
