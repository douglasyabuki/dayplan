# Guidance for test files

- Place executable tests in `tests/unit`, `tests/browser`, or `tests/e2e` according to the behavior being verified. Keep the `tests/` root for shared helpers and fixtures.
- Choose the smallest test layer that can verify the behavior. Add coverage for meaningful outcomes, regressions, and failure paths; avoid tests that only repeat the implementation or duplicate the same assertions across all three layers.
- Name each test after the trigger and expected result. Keep setup focused, leave a blank line after the final import and between declarations, and use typed fixtures rather than broad casts.

## Where to place tests

- **Unit tests:** Put `*.unit.test.ts` (or `*.unit.test.tsx` when needed) in `tests/unit/`. Import test APIs from `vitest`. The `unit` project in `vitest.config.ts` runs in Node, without a DOM or a running Next.js app. Use it for domain functions, reducers, selectors, validation, persistence adapters, and async coordination that can be exercised without rendering React. Stub browser APIs explicitly when testing adapters that use them; `tests/guest-storage.ts` provides a storage mock. The current discovery glob is `tests/**/*.unit.test.{ts,tsx}`, but new unit tests still belong under `tests/unit/`.
- **Browser component and integration tests:** Put `*.browser.test.tsx` in `tests/browser/`. Import test APIs from `vitest`, render with `vitest-browser-react`, and use `vitest/browser` for browser interactions where needed. The `browser` project discovers only `tests/browser/**/*.browser.test.tsx` and runs headless Chromium through `@vitest/browser-playwright` using the installed Chrome channel. Use it for rendered components, hooks exercised through a harness, provider lifecycles, focus, interactions, and browser storage. Render the relevant components and providers directly; these tests do not launch the Next.js application server.
- **End-to-end tests:** Put `*.spec.ts` in `tests/e2e/`. Import `test`, `expect`, and Playwright types from `./fixtures` (adjust the relative path for nested folders). Use these tests for complete user flows, navigation, reload persistence, keyboard behavior, and drag-and-drop in the running application. `playwright.config.ts` discovers tests under `tests/e2e`, builds the app, and starts a fresh production server at `http://localhost:3100`. It uses Desktop Chrome on Chromium, two workers, parallel execution, and retained traces on failure. CI forbids focused tests and retries failures twice.
- **Helpers and fixtures:** Reuse `tests/task-fixtures.ts` for domain/workspace fixtures and `tests/guest-storage.ts` for Node storage mocks. Keep helpers shared across suites in the `tests/` root and helpers specific to one layer in that layer's directory. Keep one-off setup beside its test. Helper files must not use executable test suffixes or require a different runner merely to import them.

## Writing reliable tests

- Assert observable behavior: returned data, persisted changes, visible UI, accessible state, navigation, or recoverable errors. Use role and label locators first; use test IDs for harness outputs or elements without a useful accessible locator.
- Vitest 5 browser text locators match exactly by default. Use `toHaveTextContent` for the whole expected text and `toMatchTextContent` for a substring or regular expression, including negated substring checks. Use `{ exact: false }` on an individual locator only when partial matching is intended.
- Await interactions and asynchronous assertions. Use Vitest browser retrying assertions such as `expect.element(...)`, Playwright's locator assertions, or explicit completion signals instead of arbitrary sleeps. Use controlled promises and fake timers where they make races or debounce behavior deterministic, and restore real timers afterward.
- Mock external boundaries such as auth, network requests, or storage failures while keeping the behavior under test real. Mocked API flows verify the client contract; they do not prove the real server or database works.
- Clean up state created by a test: restore spies, unstub globals and environment variables, reset timers, remove listeners, and clear browser storage as appropriate. Keep tests independent of execution order, real accounts, and external services.
- Keep `vi.mock`, `vi.unmock`, and `vi.hoisted` at module scope. Vitest 5 clears mock call history before each test by default, so assertions must not depend on calls recorded in another test or `beforeAll`. Mock implementations remain intact.
- E2E tests use `tests/e2e/fixtures.ts`, which returns a guest session by default. Account scenarios should register their own session route after that default and provide the API responses they need. Install routes and initial storage before navigation. Avoid shared mutable state because E2E tests run in parallel.
- When covering a bug, make the assertion fail for the original behavior and pass for the corrected behavior. Include relevant edge cases such as cancellation, stale responses, invalid inputs, or failed persistence when they are part of the change.
- Do not commit generated screenshots, traces, test results, or coverage output. Remove accidental `test.only`/`describe.only` before finishing.

## Running and maintaining tests

- Vitest 5 requires Vite 6.4 or newer and a supported Node.js version: `^22.12.0 || ^24.0.0 || >=26.0.0`. Use a compatible runtime locally and in CI; installing compatible Node type declarations does not upgrade the runtime.
- `npm run test:unit` runs the Node unit suite.
- `npm run test:browser` runs the Vitest browser suite. It currently uses `--passWithNoTests`, so a successful exit alone does not prove tests were discovered; check the reported file and test counts after changing paths or globs.
- `npm run test:e2e` runs the Playwright suite and its production build/server setup. It does not reuse an existing server; port 3100 must be available.
- `npm test` runs unit, browser, and E2E suites in order, stopping at the first failure.
- `npm run test:watch` watches the Vitest projects; it does not run the Playwright E2E suite.
- `npm run test:account` runs only the account-persistence, account-data-source, and guest-import unit files. It does not run account browser or E2E tests.
- For a focused check, use `npm run test:unit -- tests/unit/tags.unit.test.ts`, `npm run test:browser -- tests/browser/workspace-tags.browser.test.tsx`, or `npm run test:e2e -- tests/e2e/tag-hierarchy.spec.ts`. Use `npm run test:watch -- --project unit` or `--project browser` to select a Vitest project in watch mode.
- Run the affected suite for behavior changes; broaden verification when a change crosses layers or modifies shared infrastructure. Documentation-only changes need path, command, and formatting checks rather than a full application test run.
- Keep this guidance aligned with `vitest.config.ts`, `playwright.config.ts`, and `package.json`. When moving or renaming tests, update fixture imports and any explicit script paths, then verify discovery. Preserve the boundary between Vitest test suffixes and Playwright spec suffixes.
