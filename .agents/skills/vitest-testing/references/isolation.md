# Mocking, async work, and isolation

## Controllable boundaries

Prefer real fast implementations and typed fixtures. Mock transport/auth responses, unavailable storage, or dependency completion when that uncertainty is the subject of the check. Do not mock the subject itself. Official request guidance recommends MSW; it is not installed here. Use existing typed fetch mocks/E2E routes when appropriate, reject unexpected requests, and do not install a dependency just to copy an example. [Mock functions](https://vitest.dev/guide/learn/mock-functions), [requests](https://vitest.dev/guide/mocking/requests).

## Module timing and types

- `vi.mock`, `vi.unmock`, and `vi.hoisted` are hoisted and in Vitest 5 must be at module top level. Factories cannot capture ordinary later-initialized variables/imports. Use `vi.hoisted(() => ({ save: vi.fn<Save>() }))` for shared state, with a type available without runtime imports.
- Prefer typed module factories: `vi.mock(import("./dependency"), async (importOriginal) => { const actual = await importOriginal(); return { ...actual, save: vi.fn<typeof actual.save>() }; })`. This partial mock preserves other exports. A default export requires a `default` key. `vi.mocked(value)` changes typing, not runtime behavior; configure it only after actually mocking the value. Avoid unnecessary type escapes.
- `vi.doMock` is not hoisted and affects subsequent dynamic imports, not existing static bindings. Arrange the runtime mock then `await import(...)`; reset caches deliberately if fresh module state is needed. A setup import may already have cached the module.
- Mocking an export cannot intercept its direct same-module callers. Test the public behavior; injection or splitting modules is an implementation choice only within authorized scope.
- Browser Mode uses native ESM/sealed namespaces; do not spy directly on module exports. Use a factory or `vi.mock(import("./dependency"), { spy: true })`. Plain automocking stubs functions returning undefined; spy mode retains real implementations and tracks calls. Spies on ordinary object/DOM methods are a different case.

Sources: [modules](https://vitest.dev/guide/mocking/modules), [vi API](https://vitest.dev/api/vi), [Vitest 5 semantics](https://vitest.dev/guide/migration/). Confirm installed declarations instead of copying Jest assumptions.

## Cleanup operations differ

| Operation | Effect and limits |
| --- | --- |
| `mockClear` / `vi.clearAllMocks` | Clears history, keeps implementations and queued one-time behavior. Default before-test clearing here means beforeAll/previous-test calls cannot support later assertions. |
| `mockReset` / `vi.resetAllMocks` | Clears history and one-time overrides; resets implementation. `vi.fn()` resets to empty behavior; `vi.fn(impl)` to its initial implementation. Reestablish scenario behavior. |
| `mockRestore` | Individual reset plus original descriptor restoration for a spy. |
| `vi.restoreAllMocks` | Restores original descriptors for spyOn spies; does not clear their saved history/reset their mock implementations or remove automocking. Re-spy before overriding the object method again. |
| `vi.resetModules` | Clears evaluation caches for future imports, not existing static bindings or module-mock registration. |
| `vi.unmock` / `vi.doUnmock` | Removes module-mock registration with hoisted/runtime timing respectively. Existing imported references do not change retroactively. |

Sources: [mock API](https://vitest.dev/api/mock), [vi cleanup](https://vitest.dev/api/vi). Do not add blanket resets that destroy intentional beforeAll transport implementations.

Handle other resources separately: `vi.unstubAllGlobals()`/`vi.unstubAllEnvs()` restore Vitest stubs, not arbitrary assignments. Restore manual global assignments when their lifetime is not file-isolated. Close sessions, unsubscribe listeners, await component cleanup, restore timers/clocks, clear owned storage, and disconnect database clients/servers even after failure. Use scoped hooks or try/finally and await teardown. [Setup/teardown](https://vitest.dev/guide/learn/setup-teardown), [hooks](https://vitest.dev/api/hooks).

## Async and time

Await actions, resolves/rejects, `expect.poll`, and `expect.element`; unawaited async assertions fail in Vitest 5. Release controlled promises in a chosen order for races/cancellation, registering expected rejection handling before rejecting. Prefer completion signals; bounded polling callbacks should read state rather than repeat clicks/saves/mutations. [Async](https://vitest.dev/guide/learn/async), [poll](https://vitest.dev/api/expect#poll).

Enable fake timers before scheduling. Advance deliberately with `await vi.advanceTimersByTimeAsync(ms)` around deadlines, asserting before/at the threshold and the payload, not merely a callback count. `vi.setSystemTime` changes the clock without running scheduled timers; advancement runs them. This version controls Date and available global Temporal clocks. Restore clock-only mocking with `vi.useRealTimers()` too. Close/cancel owned work before restoring timers; avoid indiscriminately draining recurring timers/retries. Avoid arbitrary sleeps or fake clocks around browser interactions unless interaction and polling APIs still function. [Timers](https://vitest.dev/guide/mocking/timers), [clock APIs](https://vitest.dev/api/vi#vi-setsystemtime).
