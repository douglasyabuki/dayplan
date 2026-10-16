import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { supportDestination } from "@/lib/support";

export const metadata: Metadata = { title: "Help and contact — Dayplan" };

const guidance = [
  [
    "Capture and organize",
    "Add a task to Inbox, then use projects, sections, tags, and priorities to organize it. Press N for a new task or Ctrl/Cmd K to search when you are not typing in a field.",
  ],
  [
    "Plan your time",
    "Today shows your daily plan. Use the task editor to set scheduled dates and deadlines, or schedule in Calendar. A scheduled date and a deadline are separate. Calendar offers day, week, and month views.",
  ],
  [
    "Guest and account storage",
    "Guest plans belong to this browser. Account plans belong to the signed-in user. Signing in does not automatically merge them. Open Settings → Data to review, import, or discard guest data.",
  ],
  [
    "Understand saving",
    "Pending means workspace changes are waiting for automatic saving. Saving means work is underway. Saved confirms committed workspace edits in account storage; Saved in this browser confirms local guest storage. Open task-editor drafts and profile changes are separate.",
  ],
  [
    "Offline and recovery",
    "Offline means account storage cannot be reached. Check the save control for recovery details. Keep the page open or download a backup until saving is confirmed. Needs attention means a conflict, import, or storage problem needs an action. Use Settings → Data to retry or review recovery. Loading the server version replaces local edits and requires confirmation.",
  ],
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
  const contact = supportDestination(process.env.DAYPLAN_SUPPORT_URL);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold">Help and contact</h1>
        <p className="text-muted-foreground">
          A quick guide to planning and keeping your work safe.
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
      <section
        className="flex flex-col items-start gap-3"
        aria-labelledby="contact-heading"
      >
        <h2 id="contact-heading" className="text-lg font-medium">
          Contact support
        </h2>
        <p>
          Include what you tried, what happened, your browser/device, and an
          error reference if one is shown. Remove private information. Workspace
          data and credentials are never attached automatically.
        </p>
        {contact ? (
          <Button nativeButton={false} render={<a href={contact} />}>
            Contact support
          </Button>
        ) : (
          <p className="text-muted-foreground">
            A support contact has not been configured by the application owner
            yet. No monitored contact destination is currently available here.
          </p>
        )}
      </section>
    </main>
  );
}
