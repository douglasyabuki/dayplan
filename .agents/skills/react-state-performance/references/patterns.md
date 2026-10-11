# Patterns and version constraints

These are optional patterns for an evidence-supported change; the repository currently exposes Context hooks, not a Zustand workspace hook.

## Select subscriptions deliberately

For a proposed provider-scoped `StoreApi<{ state: Workspace; act: ... }>`, consume only the required field:

```tsx
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

// Inside a component/custom hook with the scoped store supplied by Context:
const theme = useStore(store, (s) => s.state.theme);
const act = useStore(store, (s) => s.act);
const collections = useStore(
  store,
  useShallow((s) => ({ projects: s.state.projects, tags: s.state.tags })),
);
```

Avoid whole-store reads and selection of the entire Workspace when a consumer only needs theme, today, readiness, or one entity. Check parent renders and Context reads too: selectors cannot eliminate those causes. Do not substitute `getState()` for a render subscription; it will not update the UI.

Zustand v5 requires stable selector **outputs**: allocating arrays, objects, or fallback functions on each snapshot can cause update loops. Inline selector functions returning stable fields are acceptable; `useCallback` around a selector does not stabilize its allocated result. Use separate selectors, module-level empty constants, or `useShallow` for shallow-equal tuples/objects. Nested allocations defeat shallow equality; it also does not avoid the calculation itself. Standard v5 `create` does not accept the old equality argument; inspect installed peers before considering `zustand/traditional`. See [v5 migration](https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5) and [useShallow](https://zustand.docs.pmnd.rs/learn/guides/prevent-rerenders-with-use-shallow).

## Stable actions and derived data

Create store actions once in its initializer and read current data with `get()` at invocation, not captured render snapshots. Keep state updates immutable and atomic. Preserve `act`'s boolean result, command validation, notices, and undo snapshots; replacing reducer dispatch with direct setters is not equivalent. Replacing a whole Zustand state can erase actions; prefer updating the domain `state` field. For Context, use callbacks with correct dependencies or current refs where semantics justify them; do not hide stale closures behind empty dependency lists.

Subscribe to stable inputs and compute derived results with `useMemo` when measured cost warrants it; for reusable expensive calculations consider a bounded cache keyed by every relevant input. Inspect existing helpers/caches first. Dependencies can include tasks, exceptions, metadata, timezone/today, range, view, selection, and query; never omit one merely to reduce rerenders. Avoid copying groups/counts/expanded occurrences into writable or persisted state. Split derivation by true dependencies only after checking helper signatures and consumers. See [React useMemo](https://react.dev/reference/react/useMemo).

Keep temporary UI state at its existing owner unless coordination requires lifting it. In particular, preserve draft session initialization, save/cancel snapshots, route cleanup, drag source mounting, focus return, and handle identity. Transitions are not a way to make external-store writes non-blocking; moving editor state to a store can change scheduling. See [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore).

## Persistence and hydration

Prefer retaining existing persistence adapters during a subscription refactor. Zustand `persist` normally stores an envelope with `state` and `version`; Dayplan stores raw domain JSON. Reusing the same key without an adapter/migration is incompatible. Domain Workspace version 2 is distinct from middleware's version. Test existing fixtures and error recovery. `partialize` limits saved fields, not subscriptions or necessarily write frequency; profile synchronous serialization/storage separately.

If middleware is justified, use explicit `partialize`, `version`/`migrate`, validation/merge, and hydration-error handling. Exclude actions, DOM references, drafts, confirmations, notices, and calculated data. `skipHydration` with effect-driven `rehydrate()` can preserve deterministic initial rendering; expose reactive readiness rather than reading non-reactive `hasHydrated()` alone. Preserve the writable gate so hydration failure cannot overwrite saved data. See [official persistence guidance](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data).

Client Components can be prerendered on the server. For a new store, instantiate a vanilla store once per provider instance with identical initial server/client snapshots; provide its stable API through Context. Do not share user state in a server module singleton or read/write the store from Server Components. Preserve workspace-layout lifetime and shell loading behavior, then hydrate browser data after mount. Keep browser APIs out of server render; `suppressHydrationWarning` is not a store hydration fix. Zustand's [Next.js guide](https://zustand.docs.pmnd.rs/learn/guides/nextjs) is conceptual and marked for revision; reconcile examples with installed Next.js docs:

- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`
- `node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md`

## Evidence to retain

For each change record the scenario/data size, affected consumers, environment, baseline and after samples, measurement method, and preserved behavior. React [Profiler](https://react.dev/reference/react/Profiler) reports committed rendering duration; it does not measure all event-handler, storage, layout, or paint work. Use browser performance traces for those costs. Without comparable samples, describe a hypothesis or verified subscription invariant, not an achieved speedup.
