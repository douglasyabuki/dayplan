# Repository map and inspected baseline

Inspected **2026-10-14**. Recheck this baseline against `package.json`, `package-lock.json`, installed manifests/declarations, configs, and current tests before relying on it. It is not an upgrade instruction. Versions matched installed packages and lock entries; `npm ls` reported no compatibility problems for the inspected testing tree.

| Package/runtime | Installed | Compatibility evidence |
| --- | --- | --- |
| `vitest` | 5.0.4 | Node `^22.12.0 || ^24.0.0 || >=26.0.0`; Vite `^6.4.0 || ^7.0.0 || ^8.0.0` |
| `@vitest/browser`, `@vitest/browser-playwright`, `@vitest/browser-preview` | 5.0.4 each | Require Vitest 5.0.4; Playwright provider accepts `playwright: *`; preview is installed but unused |
| `vitest-browser-react` | 2.3.0 | Vitest `^4.0.0 || ^5.0.0`; React/DOM and their types accept 18 or 19 |
| `@playwright/test`, `playwright` | 1.63.0 each | Node >=20; matching Playwright dependency |
| `vite` | 7.3.7 | Node `^20.19.0 || >=22.12.0` |
| `@vitejs/plugin-react` | 5.2.0 | Installed Vite 7 satisfies its Vite 4.2 through 8 peer range |
| `vite-tsconfig-paths` | 6.1.1 | Vite `*` |
| React / React DOM | 19.2.8 each | DOM requires React `^19.2.8` |
| `@types/react` / `@types/react-dom` | 19.3.0 each | Satisfy renderer's React 19 type peer ranges |
| TypeScript / Node types | 5.9.3 / 24.19.2 | Separate from runtime execution |
| Node runtime | 24.16.0 | Satisfies installed engines |

Installed manifests establish exact compatibility. Official [Vitest 5 notes](https://vitest.dev/guide/migration/) corroborate major requirements and semantics; do not repeat the completed migration.

## Runners and discovery

`vitest.config.ts` defines inline `unit` and `browser` projects with `extends: true`, inheriting React and tsconfig-paths plugins. `tsconfig.json` maps `@/*` to `./*`. Browser dependencies are prebundled to avoid reloads/duplicate React. Preserve this setup instead of copying a generic jsdom recipe. Browser Mode is a project mode, not a Node environment. [Projects](https://vitest.dev/guide/projects), [environments](https://vitest.dev/guide/environment).

| Runner | Discovery and execution | Representative tests |
| --- | --- | --- |
| Vitest `unit` | `tests/**/*.unit.test.{ts,tsx}`; Node; explicit Vitest imports; no DOM/app server | `task-operations`, `workspace-transitions`, `account-debounce`, `account-data-source`, `account-persistence` |
| Vitest `browser` | `tests/browser/**/*.browser.test.tsx`; direct React mounting; headless Chromium through `@vitest/browser-playwright`, `channel: "chrome"` | `workspace-tags`, `workspace-sync`, `workspace-lifecycle`, `session-auth` |
| Playwright | `tests/e2e`; default Playwright test matching, current files `*.spec.ts`; Desktop Chrome/Chromium; two workers; fully parallel | `task-actions`, `sidebar-drag`, `auth-screens`, `settings-data` |

No Vitest `setupFiles` or custom cleanup configuration is declared. Installed defaults: `clearMocks: true`, `mockReset: false`, `restoreMocks: false`; see the official [clearMocks default](https://vitest.dev/config/clearmocks). Renderer cleanup runs in beforeEach; suites separately restore mocks/storage. See [browser lifetime](browser.md).

`playwright.config.ts` builds the app and starts a fresh production server at `http://localhost:3100`, with `reuseExistingServer: false`. CI-conditioned settings forbid focused tests, retry failures twice, and retain traces on failure. No checked-in CI workflow/pipeline was found during inspection; these flags do not establish what remote CI actually executes.

## Shared resources and source boundaries

- `tests/task-fixtures.ts`: typed task/child/workspace builders and recurrence references. Its legacy `domain` aggregator has broad typing; prefer typed builders/direct imports rather than extending type escapes.
- `tests/guest-storage.ts`: fresh Map-backed localStorage stub per invocation; restore the global explicitly. It does not emulate browser events or a DOM.
- `tests/e2e/fixtures.ts`: exports Playwright APIs and supplies a guest `/api/auth/get-session` route. Account tests register routes afterward. Seed storage/routes before navigation and avoid reseeding on reload when verifying persistence.
- `lib/tasks/{recurrence,operations,mutations}.ts`, `stores/workspace/{commands,reducer,transitions}.ts`: occurrence/series behavior and grouped immutable changes.
- `stores/workspace/persistence-session.ts`: lifetime, serialized saving, debounce, flush, cancellation. `account-data-source.ts`, `recovery-journal.ts`, `coordination.ts`: revisions, receipts, recovery, deadlines. `provider.tsx`: remote adoption, drafts, confirmation and Undo.
- `stores/session/provider.tsx`, `stores/session/departure.ts`, `stores/account/`, workspace entry logic: account scope and safe departure.
- `lib/workspace/server.ts`, `lib/server-session.ts`, API routes: verified ownership and atomic writes. See [database scenarios](scenarios.md).

Existing dnd-kit, react-state-performance, and Prisma skills own implementation-specific guidance; this skill owns testing decisions. For framework code edits, obey root AGENTS.md and read the relevant installed Next.js guide. The installed testing guide recommends E2E for async Server Components; its generic jsdom setup is not this repository's setup.
