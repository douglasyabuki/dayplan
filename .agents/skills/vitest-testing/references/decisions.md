# Testing decisions and review

The official [AI testing guide](https://vitest.dev/guide/learn/writing-tests-with-ai) and [testing in practice](https://vitest.dev/guide/learn/testing-in-practice) recommend behavioral coverage and regression reproduction. Dayplan's test locations are repository conventions, not framework requirements.

Choose the smallest useful boundary:

- Node: domain operations, recurrence, validation, adapters, queues, controlled races. Use a real isolated database when ownership, conflicts, or atomic writes are the contract.
- Browser Mode: rendered controls, provider transitions, storage, focus, browser events. Mount the relevant provider rather than faking its behavior.
- Playwright: complete navigation, reload persistence, auth screens, keyboard/drag flows, and application boundaries. Mocked account routes establish client behavior, not live auth or database correctness.

Use expected values understandable independently: explicit dates, ordered IDs, changed fields, preserved data, visible states, documented errors. Do not call the production algorithm to generate its own expected output. Round-trip checks are useful invariants but cannot prove either direction matches an external contract. Name the trigger/result; avoid dependent tests for one coherent workflow. [Writing tests](https://vitest.dev/guide/learn/writing-tests), [test API](https://vitest.dev/api/test).

Use `toBe` for values or meaningful identity, `toEqual` for structure, `toStrictEqual` when undefined/type/sparse-array distinctions matter, and `toMatchObject` for an intentional subset. Pair call/subset assertions with observable outcomes when omitted fields could conceal corruption. Assert input immutability/structural sharing only where it is a contract. Avoid incidental render counts, private fields, generated IDs, and internal call ordering unless they establish a required effect. [Matchers](https://vitest.dev/guide/learn/matchers), [expect API](https://vitest.dev/api/expect).

For a reproducible bug, prefer observing the intended behavioral failure on the original implementation. A harness/import error or zero-test run is not that failure. Correct existing expectations only with contract evidence, never solely to obtain green output.

## Review checklist

- Would a plausible wrong implementation fail a meaningful assertion?
- Are expectations independent and grounded in intended behavior?
- Are realistic boundary/error cases covered at an appropriate layer?
- Are mocks necessary boundaries, with the subject real?
- Are APIs compatible and actions/async assertions awaited?
- Are components, timers, listeners, globals, storage, accounts, and DB resources isolated and cleaned up?
- Did the intended tests actually execute under the correct discovery glob/project?
- Would harmless internal refactoring leave tests passing?

Use small focused snapshots for meaningful reviewable output, not sprawling DOM/workspace dumps as the sole assertion. Review each difference and its reason before updating; do not auto-accept. [Snapshots](https://vitest.dev/guide/learn/snapshots).

Coverage reveals unexercised code, not correctness. Runtime TypeScript transformation does not replace compiler checking. [Coverage](https://vitest.dev/guide/coverage), [testing types](https://vitest.dev/guide/testing-types).
