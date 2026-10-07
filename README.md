# Dayplan

A UI-only task manager built with Next.js App Router, React, Tailwind CSS 4, shadcn Base UI, and `@dnd-kit/react`.

## Start

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. The root opens Today. On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`.

The workspace starts with sample tasks dated relative to the first launch in a browser. Changes are stored in that browser under `dayplan.workspace.v2`. The app does not import data from older storage keys. Use the account/settings button to reset the workspace to fresh sample data.

## Included

- Inbox, Today, Upcoming, All tasks, project/tag views, global search, Completed, and Archive.
- Task editing, priorities, tags, checklist subtasks, independent deadlines and scheduled work, and recurring occurrences.
- Filtering, sorting, grouping, manual drag ordering, project drop targets, and non-drag move controls.
- Independent Inbox and project sections, shared between List and Kanban views, with remembered layout preferences.
- Section creation, renaming, reordering, and deletion with a choice to delete tasks or move them to another section. Unsectioned always remains available.
- Day/week/month calendars, an unscheduled tray, timed blocks, overlap layout, and drag rescheduling.
- Responsive navigation and task sheets, light/dark/system themes, undo feedback, and local-storage recovery notices.

Press **N** to add a task or **Ctrl/Cmd K** to search. Drag using task handles; scheduling and project assignment are also available in the editor. Calendar time slots snap to 15 minutes and new blocks default to 30 minutes. Double-click a time slot to create a task there.

In Inbox or a project, use **List / Kanban** to switch layouts and **Add section** to organize tasks. Section menus provide rename and delete actions; arrows or drag handles change section order. Drag tasks between sections, or choose a section in the task editor. Manual task ordering is available when sorted by Manual order. Section membership does not change completion. Changing a task's project resets its section to Unsectioned.

Deleting a section applies to all its tasks, including completed, archived, and filtered-out tasks. Deleting a member recurring series also deletes its occurrences; a moved-in occurrence from a different series is deleted individually. The move option preserves tasks and recurring series. The notification offers Undo.

## Data boundaries

`lib/tasks` contains the task and workspace types, reducer, selectors, date arithmetic, recurrence expansion, seed data, and storage adapter. `contexts/workspace.tsx` owns browser hydration, persistence, and workspace mutations; `contexts/workspace-controller.tsx` connects URL state and domain state to the views. `components/workspace/workspace-shell.tsx` renders the workspace shell, and `components/workspace/workspace-feedback.tsx` renders undo, confirmation, and storage feedback. The route loading fallback is `app/(workspace)/loading.tsx` and uses the shared workspace loading components.

Dates without a time remain calendar dates. Timed values represent local wall-clock time in the saved workspace timezone. Recurrence shifts calendar dates while retaining wall-clock times, so daily tasks do not drift across daylight-saving changes. Monthly repeats clamp to the last valid day of the month.

Recurring occurrences have stable `seriesId@date` identities. Individual edits and completion persist as exceptions; ordinary future occurrences are generated for the requested range. Editing a series preserves exceptions and completed history. Archive applies to the series independently of completion.

There is no authentication, remote synchronization, database client, or API layer. The standalone `temp/my-prisma-postgres-app` example is excluded from the root app's TypeScript and lint scopes. Workspace data stays in browser local storage.

Saved workspaces are validated when loaded. Missing data seeds a fresh sample workspace. Invalid stored data triggers the storage recovery UI and is not overwritten automatically. Older storage keys are ignored, so they are left untouched and are not migrated.

## Validation

Run `npm test` for the domain and interaction logic tests, including storage validation and section, route, editor, presentation, and drag behavior. Other available checks are `npm run lint`, `npx tsc --noEmit`, and `npm run build`. Interactive checks should cover pointer and keyboard dragging, mobile navigation, long names, horizontal board scrolling, and theme changes.
