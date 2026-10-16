# Dayplan

A task manager with browser-local guest access and database-backed accounts. Built with Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/Base UI, and `@dnd-kit/react`. Google and GitHub authentication use Better Auth; account data is stored in PostgreSQL through Prisma ORM 7 and its PostgreSQL driver adapter.

## Start

Use Node.js 22.12+ and npm, with a PostgreSQL database available for authentication and account persistence.

1. Install dependencies with `npm ci`.
2. Copy [.env.example](.env.example) to `.env.development.local` and fill in the values below. Preserve any existing database connection settings.

| Variable               | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string used by Prisma and the server.    |
| `BETTER_AUTH_URL`      | App origin; use `http://localhost:3000` for local development. |
| `BETTER_AUTH_SECRET`   | Random authentication secret of at least 32 characters.        |
| `GOOGLE_CLIENT_ID`     | Google Web application OAuth client ID.                        |
| `GOOGLE_CLIENT_SECRET` | Matching Google OAuth client secret.                           |
| `GITHUB_CLIENT_ID`     | GitHub OAuth app client ID.                                    |
| `GITHUB_CLIENT_SECRET` | Matching GitHub OAuth app client secret.                       |

3. Choose your development database:

   **Local PostgreSQL (default):** Install and start Docker Desktop with Docker Compose v2, then run:

   ```sh
   npm run dev:local
   # npm run dev is an alias for dev:local
   ```

   This starts PostgreSQL 17 from [docker-compose.yml](docker-compose.yml), waits for its health check, generates the Prisma client, applies checked-in migrations, and starts Next.js. The database is bound to `127.0.0.1:5433` with the development-only URL `postgresql://dayplan:dayplan@127.0.0.1:5433/dayplan?schema=public`. The runner overrides `DATABASE_URL` for this process, even if your environment files or shell contain a hosted URL. Authentication settings still come from your existing environment files.

   **Hosted Prisma Postgres:** Keep its direct PostgreSQL connection string in `DATABASE_URL` in `.env.development.local`, then run:

   ```sh
   # Apply migrations explicitly when needed (including first setup).
   npm run db:prisma:migrate
   npm run dev:prisma
   ```

   Hosted startup generates the Prisma client and starts Next.js; it does not automatically migrate the hosted database. Both modes accept Next.js flags, for example `npm run dev:local -- --port 3001` (update `BETTER_AUTH_URL` and your OAuth redirect URI to match).

Next.js and `prisma.config.ts` load `.env.development.local` during development. Keep real credentials in ignored environment files or deployment environment variables. The existing generic `db:check` and direct Prisma CLI commands use your configured `DATABASE_URL`; use the explicit commands below to select the database.

| Command                     | Purpose                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `npm run db:local:up`       | Start Docker PostgreSQL and wait until healthy.                       |
| `npm run db:local:down`     | Stop/remove the container while retaining its data volume.            |
| `npm run db:local:migrate`  | Start local PostgreSQL and apply checked-in migrations.               |
| `npm run db:local:check`    | Start local PostgreSQL and verify connectivity through Prisma.        |
| `npm run db:prisma:migrate` | Apply checked-in migrations to the configured hosted database.        |
| `npm run db:prisma:check`   | Verify connectivity to the configured hosted database through Prisma. |

Local data persists in the Compose `postgres-data` volume across restarts. Stopping Next.js leaves the database running; use `db:local:down` when finished. The two databases have separate accounts and workspaces; switching modes does not copy data between them.

For Google sign-in, register `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI in the Google OAuth client. For a deployment, use its app origin in both `BETTER_AUTH_URL` and the callback URI.

For GitHub sign-in, create a GitHub OAuth app and set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in your ignored environment files or hosting environment. `.env.example` contains empty placeholders only. Use these callbacks:

- Local: `http://localhost:3000/api/auth/callback/github`
- Preview: `https://dayplan-git-develop-douglasyabukis-projects.vercel.app/api/auth/callback/github`
- Production: `https://douglasyabuki-dayplan.vercel.app/api/auth/callback/github`

Set `BETTER_AUTH_URL` to the matching environment origin. Keep GitHub user access token expiration enabled and Device Flow disabled. Use separate production credentials if you want independent credential rotation. Both providers are optional and independently configured; missing credentials disable only that provider's buttons. Guests can continue without either provider.

Matching resolved, verified emails automatically link Google and GitHub to the same Dayplan user. Settings → Account → Connected accounts supports explicitly connecting different verified emails while signed in. Secondary GitHub emails are not used for custom matching; a private profile email is resolved through GitHub's email API. Connecting preserves your Dayplan profile and workspace. Identities owned by another user cannot be connected, and at least one sign-in method must remain. Validate real provider consent and callback flows after filling in credentials.

Open `http://localhost:3000`. The root redirects to Today; first-time guests are sent to `/welcome` to choose how to continue. Returning guests and signed-in users use the same workspace routes. `/sign-in` and `/sign-up` both offer Google and GitHub. On Windows PowerShell, use `npm.cmd` or `npx.cmd` if script execution policy blocks their PowerShell wrappers.

New guest workspaces start with sample tasks dated relative to their creation and are saved under `dayplan.workspace.v2` in browser local storage. New account workspaces start empty. Settings provides sample-data reset, clear-data, and JSON backup/restore actions for the current workspace.

## Production

Configure the same server environment variables for production, then run:

```sh
npx prisma migrate deploy
npm run build
npm start
```

`npm run build` generates the Prisma client before building Next.js; it does not apply migrations. `npm run vercel-build` generates the client, applies migrations, and builds the app. Account API routes use the Node.js runtime and require access to PostgreSQL.

## Included

- Inbox, Today, Upcoming, All tasks, project/tag views, global search, Completed, and Archive.
- Task editing, priorities, tags, checklist subtasks, independent deadlines and scheduled work, and recurring occurrences.
- Filtering, sorting, grouping, manual drag ordering, project drop targets, and non-drag move controls.
- Independent Inbox and project sections, shared between List and Kanban views, with remembered layout preferences.
- Section creation, renaming, reordering, and deletion with a choice to delete tasks or move them to another section. Unsectioned always remains available.
- Day/week/month calendars, an unscheduled tray, timed blocks, overlap layout, and drag rescheduling.
- Responsive navigation and task sheets, light/dark/system themes, undo feedback, and local-storage recovery notices.
- Welcome/onboarding, Google sign-in and account switching, editable profile names, and separate guest/account workspaces.
- Explicit guest-to-account import, JSON backup/restore, sample-data reset, clear-data, and account save/recovery feedback.

Press **N** to add a task or **Ctrl/Cmd K** to search. Drag using task handles; scheduling and project assignment are also available in the editor. Calendar time slots snap to 15 minutes and new blocks default to 30 minutes. Double-click a time slot to create a task there.

In Inbox or a project, use **List / Kanban** to switch layouts and **Add section** to organize tasks. Section menus provide rename and delete actions; arrows or drag handles change section order. Drag tasks between sections, or choose a section in the task editor. Manual task ordering is available when sorted by Manual order. Section membership does not change completion. Changing a task's project resets its section to Unsectioned.

Deleting a section applies to all its tasks, including completed, archived, and filtered-out tasks. Deleting a member recurring series also deletes its occurrences; a moved-in occurrence from a different series is deleted individually. The move option preserves tasks and recurring series. The notification offers Undo.

## Persistence and accounts

Guests use browser local storage; signed-in users load and save a user-owned workspace snapshot in PostgreSQL. Signing in does not automatically transfer guest data. An import preview and confirmation let you add the guest workspace to the account, or discard the guest copy. Successful import removes the imported guest workspace and guest profile name from the browser while preserving newer guest changes. Retrying the same imported snapshot does not add duplicates; importing a changed snapshot can add separate copies and requires confirmation.

Account edits appear immediately in memory and are staged in a per-user, per-tab IndexedDB recovery journal. Network saves normally wait for 10 seconds of inactivity, with a maximum delay of 60 seconds. Web Locks coordinate account operations across tabs. Revision checks detect saves from another tab or device instead of silently overwriting them; save operation IDs make retries safe. This is snapshot persistence with conflict recovery, rather than live collaborative editing.

Settings > Data offers retry, server reload, and backup actions when storage needs attention. Restoring a valid JSON backup replaces the entire workspace, including theme and timezone, after confirmation. Resetting to sample data and clearing data preserve the profile, theme, and timezone. Sign-out and account switching resolve pending saves or recovery first; unresolved edits can require explicit discard before leaving. Guest data and account recovery remain isolated by ownership.

Guest workspaces are validated when loaded. Missing data seeds a fresh sample workspace; invalid stored data triggers recovery feedback and is not overwritten automatically. Older workspace storage keys are ignored and are not migrated. Account loads and restored backups are also validated.

Google is the implemented sign-in provider. Password changes and account deletion are currently disabled in Settings.

## Code organization and domain rules

Shared domain contracts and values live in `types-and-constants/`. Pure rules live under `lib/`: tasks own hierarchy, recurrence, completion, editing, and occurrence exceptions; tags own their tree; projects and sections own their collection rules. `lib/calendar/layout.ts` positions task occurrences, `lib/workspace/` owns routes, view selection, grouping, layout keys, and sample data, and `lib/dates.ts` supplies general date operations. `lib/utils.ts` retains the shadcn `cn()` alias.

`stores/workspace/provider.tsx` owns one workspace state and the coordinated commit path, including hydration, persistence, Undo, confirmations, and errors. The reducer dispatches domain mutations; `commands.ts` constructs editor and drag transactions, while `transitions.ts` combines domain rules for atomic tag/project deletion and section moves. Data-source adapters separate guest storage from account API access; persistence sessions, coordination, and recovery journals handle asynchronous saves and owner changes. The version 2 workspace schema and guest storage key remain unchanged. Domain logic does not import the store or React.

`stores/session/`, `stores/account/`, and `stores/onboarding/` own session transitions, profiles, and guest entry state. `lib/auth.ts`, `lib/server-session.ts`, and `lib/prisma.ts` provide server authentication, session verification, and the shared database client. `lib/workspace/server.ts` handles account snapshot saves and imports; `prisma/` contains the schema and migrations. Generated Prisma code lives in ignored `lib/generated/prisma/`.

`contexts/workspace-controller.tsx` remains the composition facade, using focused navigation and tag-expansion hooks under `hooks/`. Components are grouped under tasks (including editor and controls), tags, projects, sections, and calendar. The calendar context stays private to calendar UI; the shared name/color dialog serves both projects and tags. `components/ui/` remains reserved for shadcn primitives. `components/workspace/` composes the application, including shell, overlays, loading, Undo, confirmation, and storage feedback. Routes, layouts, and styling remain under `app/`, and tests remain under `tests/`.

Dates without a time remain calendar dates. Timed values represent local wall-clock time in the saved workspace timezone. Recurrence shifts calendar dates while retaining wall-clock times, so daily tasks do not drift across daylight-saving changes. Monthly repeats clamp to the last valid day of the month.

Recurring occurrences have stable `seriesId@date` identities. Individual edits and completion persist as exceptions; ordinary future occurrences are generated for the requested range. Editing a series preserves exceptions and completed history. Archive applies to the series independently of completion.

`app/api/` exposes authentication, auth availability, profile, workspace, and guest-import endpoints. Workspace routes support public guest access; account reads and writes verify the server session and derive ownership from it. Account mutations also validate the request origin. The standalone `temp/my-prisma-postgres-app` example is excluded from the root app's TypeScript and lint scopes.

## Validation

| Command                | Checks                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm test`             | Unit, browser, and end-to-end suites in sequence.                                                         |
| `npm run test:unit`    | Domain rules, storage validation, account persistence, OAuth, import, and interaction logic.              |
| `npm run test:browser` | React interactions, onboarding, profiles, owner changes, recovery, and backup/restore in headless Chrome. |
| `npm run test:e2e`     | Playwright user flows against a production build on `http://localhost:3100`.                              |
| `npm run test:account` | Focused account persistence, account data-source, and guest-import unit tests.                            |
| `npm run test:watch`   | Vitest watch mode.                                                                                        |
| `npm run db:check`     | PostgreSQL connectivity through the Prisma client.                                                        |
| `npm run lint`         | ESLint.                                                                                                   |
| `npx tsc --noEmit`     | TypeScript checks; generate the Prisma client first.                                                      |
| `npm run build`        | Prisma client generation and production build.                                                            |

The browser and end-to-end configurations use installed Google Chrome (`channel: "chrome"`). Playwright builds and starts its own server on port 3100 and does not reuse an existing server. Database/OAuth unit tests use isolated PGlite databases and a mocked Google token/profile exchange. Generate the Prisma client before running those tests.

Interactive checks should cover pointer and keyboard dragging, mobile navigation, long names, horizontal board scrolling, theme changes, Google sign-in/sign-out, guest import, and storage/conflict recovery.

## Help, support, and account deletion

`/help` works without a workspace or sign-in. Set `DAYPLAN_SUPPORT_URL` before building or deploying to an owner-approved monitored HTTPS support URL or a single `mailto:` address. Invalid or missing values show an unconfigured message; the GitHub source link is not treated as support. Verify the destination before release.

Account deletion validates the current server session before showing typed confirmation and the backup option; sign-in age is unrestricted. Expired sessions require guarded sign-in to the same account and a fresh confirmation. The initial check creates no deletion intent and does not pause editing. Preparation and execution revalidate session validity, ownership, origin, and session binding after explicit confirmation. Deletion never starts automatically after sign-in. It permanently deletes the user and cascading active database records. The browser pauses account writes before sending deletion and purges only that account's recovery journals and import-cleanup metadata after confirmation. Independent guest data and other accounts are preserved. A signed, thirty-minute status capability can settle an uncertain response and cancel an uncommitted deletion intent; it never authorizes deletion. Temporary intents use the existing Verification table and are removed when replaced, cancelled, or the account is deleted. Expired intents no longer authorize deletion.

Browser cleanup failures retain an owner-scoped retry marker. A minimal tombstone prevents suspended tabs from recreating recovery records. Downloaded backups and offline copies on other devices cannot be erased by this browser. Operational backup and log retention must be supplied by the deployment owner; the UI makes no promise about their retention period.
