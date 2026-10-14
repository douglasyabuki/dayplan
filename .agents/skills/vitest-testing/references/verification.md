# Verification and diagnosis

Use installed runners through existing scripts, from the repository root. Start targeted and broaden for shared boundaries or unresolved failures. Do not change global config/install packages merely to follow examples.

| Purpose | Non-watch command |
| --- | --- |
| Node suite / file | `npm run test:unit` / `npm run test:unit -- tests/unit/account-debounce.unit.test.ts` |
| Browser suite / file | `npm run test:browser` / `npm run test:browser -- tests/browser/workspace-tags.browser.test.tsx` |
| App suite / file | `npm run test:e2e` / `npm run test:e2e -- tests/e2e/task-actions.spec.ts` |
| Account subset | `npm run test:account` (account-persistence, account-data-source, guest-import only) |
| All runners | `npm test` (unit, browser, E2E; stops on first failure) |
| Types / lint | `npx tsc --noEmit` / `npm run lint` |
| Production boundary | `npm run build` when framework/build behavior warrants it; E2E already builds |

`test:watch` watches Vitest only and is not a terminating check. Pair `-t "pattern"` with the relevant file; avoid name-only filters for the shared-state DB suite. [Filtering](https://vitest.dev/guide/filtering).

Discovery diagnostics: `npx vitest list --project unit <file>` or `--project browser`; `npm run test:e2e -- --list <file>` lists Playwright cases without the server. Collection is not execution: confirm actual run file/test counts too. `test:browser` uses `--passWithNoTests`, so success can mean zero tests. For moves check imports/script paths and both globs. [Projects](https://vitest.dev/guide/projects), [test API](https://vitest.dev/api/test).

Vitest transforms TypeScript; config does not enable compiler typecheck tests. Run the compiler for changed TypeScript; runtime execution/expectTypeOf alone is insufficient. [Testing types](https://vitest.dev/guide/testing-types). No coverage script/config or installed coverage companion was found. Collect coverage only when warranted and authorized using compatible tooling; do not accept an automatic package installation prompt. Coverage reveals gaps, not correctness. [Coverage](https://vitest.dev/guide/coverage).

## Diagnosis

- Zero tests: inspect filter, project, suffix, globs, and focused/skipped cases before claiming a pass.
- Import/harness failure: inspect aliases/inherited plugins, Node/browser boundary, generated Prisma client, server-only mocks. DB tests replace `server-only` at top level; that does not authorize changing the application boundary. [Common errors](https://vitest.dev/guide/common-errors).
- Browser/server failure: both runners use installed Chrome. E2E needs port 3100 free and a successful production build. Missing Chrome, denied processes/ports, or unavailable infrastructure blocks a check; it does not demonstrate a behavioral regression.
- Timeout/race: inspect promises, cancellation, session closure, timer advancement, artifacts before raising timeout. Do not add retries/skips to conceal it. Files can run in parallel; cases within a file are sequential by default. Concurrent cases need deliberate isolation of global clocks/DB fixtures. [Parallelism](https://vitest.dev/guide/parallelism).

Report command/scope, actual passed/failed/skipped counts, and blocked checks with causes. Separate behavioral assertions from harness/infrastructure failures. Documentation-only work needs skill validation, link/API/command checks, and a scoped diff, not the entire suite. Keep generated failure artifacts out of commits and review snapshots before acceptance.
