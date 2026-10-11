# Dayplan state architecture

Inspected 2026-10-11; this is a navigation aid, not a substitute for current source. No performance profile was captured when creating this skill.

| Area | Current ownership and investigation points |
| --- | --- |
| `app/(workspace)/layout.tsx`, `components/workspace/workspace-shell.tsx` | Server layout wraps client AccountProvider/WorkspaceProvider; shell gates on workspace `ready`, then mounts controller. Preserve provider lifetime across workspace routes. |
| `stores/workspace/provider.tsx` | `useReducer`, current-state ref, Context containing full Workspace plus actions, today, readiness, errors, notice/undo, and confirmation. Inline value/actions change identity on provider renders. `act` applies commands to the latest ref, returns success/failure, and preserves prior undo for no-op/failed actions. |
| `stores/workspace/{commands,reducer,transitions,validation}.ts`, `lib/tasks/` | Domain authority for recurrence scope, inheritance, hierarchy, task mutations, entity/section moves, validation, and no-op handling. Reuse rather than reproducing in store setters. |
| `contexts/workspace-controller.tsx` | Combines workspace data, route, derived view, editor, actions, drag, dialogs, and expansion state in one Context. Candidates for studying fan-out include header, overlays, sidebar, task items, and collection view. Local UI updates can change the entire controller value. Cost is unmeasured. |
| `hooks/workspace/use-workspace-view.ts` | Memoizes tag index, expanded occurrences, tag counts, search metadata, and matches; computes hierarchy inclusion, groups, completion totals, and other arrays during render. Trace dependencies before optimizing. |
| `lib/tasks/recurrence.ts` | `expandTasks` already caches by task-array identity, exception-record identity, and date range using WeakMaps; only one range is cached per pair. A broad `[state, from, to]` memo dependency can call it again without recomputing expansion. Measure cache hits/misses and competing ranges before adding a cache. |
| `hooks/workspace/use-workspace-navigation.ts` | URL owns view, selection, filters, date/mode, and query. Preserve back/forward and push/replace behavior. |
| `stores/account/provider.tsx` | Independent low-frequency name/profile Context, readiness, error, and `updateName` boolean contract. Inspect avatar, account panel, and settings consumers before proposing a store. |
| `components/calendar/{task-calendar.tsx,month-calendar-context.ts}` | Scoped month Context plus direct workspace consumers, including some reading only today. Inspect value identity and actual updates before replacing Context. |
| `hooks/workspace/use-workspace-{task-editor,task-actions,drag}.ts`, `components/tasks/editor/use-task-editor.ts` | Temporary drafts, handles, menu state, drag snapshots/destinations, cancellation, and editor session ownership. Keep DOM elements and imperative handles out of persisted state. |
| `hooks/tags/use-tag-expansion.ts` | Local Set of collapsed branches, persisted as an array under `dayplan.tags.collapsed.v1`; navigation reveals ancestors. Optional-storage failures are intentionally tolerated. |

Zustand is installed but no application TypeScript imports were found at inspection. `next.config.ts` does not enable React Compiler; verify current configuration before assuming automatic memoization.

## Storage contracts

- Workspace: `stores/workspace/persistence.ts` stores raw Workspace JSON at `dayplan.workspace.v2`; `validateWorkspace` validates/restores the domain shape. Provider hydrates in an effect, seeds when missing, and blocks automatic writes after hydration/write failure while retaining session data. `ready` also waits for timezone-derived today. Reset can restore writable storage; theme/system listeners and the minute timer have cleanup.
- Account: `stores/account/persistence.ts` stores `{ name }` at `dayplan.account.v1`; malformed data falls back, unavailable storage is surfaced. Name updates trim input and retain the in-memory result on write failure.
- Preserve these distinct failure policies. A storage-format change needs compatibility validation rather than silently dropping existing user data.

## Validation routing

Use the installed npm scripts; browser and e2e configs use Chrome through Playwright. E2E starts/reuses localhost:3000 via the configured dev server, so its timing is not a production benchmark.

- Domain changes: `npm run test:unit -- tests/unit/workspace-transitions.unit.test.ts tests/unit/task-operations.unit.test.ts`; choose additional tag, section, editor, grouping, drag, or calendar-layout suites for the actual path.
- Provider/undo/storage changes: `npm run test:browser -- tests/workspace-tags.browser.test.tsx`; this existing harness exercises no-op/failed operation undo and storage behavior. Extend coverage for affected hydration/account contracts when needed.
- Consumer/UI changes: `npm run test:e2e -- tests/e2e/task-actions.spec.ts` or relevant `tag-hierarchy`, `section-actions`, `status-groups`, `aggregate-views`, `sidebar-drag` specs. Shared state changes may justify all suites via `npm test`.
- Manual checks when affected: first load/reload, valid/malformed/unavailable storage, saved theme/timezone, route back/forward, edit save/cancel, recurrence scope, undo, invalid actions, keyboard focus, list/board/calendar and drag cancel/drop. Use isolated browser fixtures rather than overwriting personal workspace storage.
