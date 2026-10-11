---
name: react-state-performance
description: Investigate and incrementally improve React state and rendering performance in Dayplan, including Context boundaries, derived calculations, and selective Zustand subscriptions. Use for state-related performance reviews and targeted refactors; require evidence before recommending a store migration.
---

# React state performance

Improve the affected interaction while preserving its behavior. Zustand is an available tool, not an automatic performance improvement or a reason to rewrite the application.

## Inspect and establish evidence

- Read [the repository map](references/repository.md) for the affected path, then verify current providers, consumers, domain operations, and tests. Search all consumers before changing a shared contract: `rg -n 'useWorkspace\(|useAccount\(|useWorkspaceController\(' components contexts hooks tests`.
- Check `package.json`, the lockfile, and installed React, React DOM, Next.js, and Zustand package versions. The inspected baseline is React/React DOM **19.2.8**, Next.js **16.3.6**, Zustand **5.0.15**. Before framework code changes, read the relevant installed guide in `node_modules/next/dist/docs/` as required by `AGENTS.md`; follow scoped hook/lib instructions too. Do not upgrade dependencies incidentally.
- Reproduce a concrete interaction with representative task counts, recurrence ranges, and hierarchy depth. Record the trigger, affected consumers, and expected output. Use React DevTools Profiler or temporary `<Profiler>` instrumentation where practical; measure calculation/storage time separately when relevant. Compare repeated runs with the same data, route, device, and build mode. Development Strict Mode and instrumentation can distort counts/timings; ordinary production builds disable React profiling.
- Trace update causes: local state, parent props, Context value identity, store selection, or effects. Identify whole-state reads, unstable object/array/function outputs, changed callback props, and calculations whose inputs did not change. Render frequency alone does not establish expensive work or a user-visible bottleneck.
- Before recommending migration, document affected consumers, evidence, simpler alternatives, expected benefit, and regression checks. Label measured bottlenecks separately from hypotheses. If profiling is unavailable, state that limitation and keep the proposal provisional; do not claim a measured gain.

## Choose the smallest change

- Keep single-owner drafts, popovers, search inputs, and drag previews in local state; lift only to the nearest shared owner when coordination requires it. Keep route/query state in the existing navigation hook. Optional persistence does not itself require a global store.
- Context is sufficient for low-frequency shared data and scoped coordination, such as the independent account provider or month-calendar callbacks. Consider moving state closer to consumers, splitting contexts by update cadence, or stabilizing provider values/actions first. Memoizing a provider value reduces incidental identity changes but cannot isolate consumers from real changes within that value; `memo` does not block Context updates. See [React useContext](https://react.dev/reference/react/useContext).
- Consider Zustand for frequently changing shared client state when consumers need independent slices and evidence supports subscription isolation. Read [implementation patterns](references/patterns.md) before adding or changing a store. A stable Context carrying a provider-scoped vanilla store can retain the existing lifetime while consumers use selectors.
- Change one boundary, subscription, or calculation at a time. Retain existing reducer/command/validation semantics and a single source of truth. Avoid two writable copies or migrating unrelated consumers. Preserve structural sharing and no-op identity; narrow subscriptions only help when selected references remain stable.

## Validate and report

- Re-run the same interaction and compare commit/render duration, calculation cost, and observable responsiveness as appropriate. Include an unaffected consumer when touching shared providers. Remove temporary instrumentation unless a maintained diagnostic is requested.
- Select relevant tests from [the repository map](references/repository.md). For code changes, run targeted unit/browser/e2e checks plus `npx tsc --noEmit` and `npm run lint`; run `npm run build` for provider, hydration, or client/server boundary changes. Report blocked checks accurately. Add tests for meaningful behavior or isolation invariants, not exact development render counts.
- Verify persistence reloads, hydration readiness, storage failures, undo/confirmation/errors, and domain invariants when their paths change. Check navigation, drafts/cancel, focus, and drag cancellation when UI ownership changes.
- Report what changed, why, validation results, before/after evidence, and remaining uncertainty. If no bottleneck is established, a scoped finding with no migration is a valid outcome.
