# Browser behavior and lifetime

Use explicit `vitest` imports, `render` from `vitest-browser-react`, and `page`/`userEvent` from `vitest/browser`. Installed renderer 2.3.0 requires awaiting render/renderHook/rerender/unmount. Its main entry registers async **beforeEach** cleanup and the component cleanup hook; `/pure` does not register beforeEach. Do not assume React Testing Library's afterEach contract. Recheck `node_modules/vitest-browser-react/dist/index.js` and its pure implementation after version changes. [Component guide](https://vitest.dev/guide/browser/component-testing), [React renderer API](https://vitest.dev/api/browser/react), [renderer source](https://github.com/vitest-dev/vitest-browser-react).

For lifecycle/storage races, await `screen.unmount()` or `cleanup()` before clearing storage or restoring spies/globals a mounted provider might use. Automatic mounting cleanup does not clear storage, reset implementations, or remove independently registered listeners. Keep cleanup order intentional without duplicating every cleanup mechanism in every suite.

Prefer accessible role/name and label queries. Use test IDs for harness output or elements without useful accessible queries; scope ambiguous matches instead of indiscriminately taking `.first()`. Vitest 5 text matching is exact by default; `{ exact: false }` locally expresses intended partial matching. Some locator examples retain older default descriptions: use the installed behavior and [version 5 semantics](https://vitest.dev/guide/migration/). [Locators](https://vitest.dev/api/browser/locators).

Await clicks/fills and userEvent actions. Fill for values; use keyboard events when key behavior matters. Invoking a handler directly does not prove focus/native interaction. Check Tab access, Enter/Space activation, arrow navigation, Escape/cancel, and focus return only where required by the control contract. For example:

```tsx
await screen.getByRole("button", { name: "Open editor" }).click();
await expect.element(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
await userEvent.keyboard("{Escape}");
await expect.element(screen.getByRole("button", { name: "Open editor" })).toHaveFocus();
```

This illustrates a possible contract, not a requirement for every editor. [Interactivity](https://vitest.dev/api/browser/interactivity).

Use `await expect.element(locator)` for retrying eventual DOM assertions. `toHaveTextContent("Saved")` checks exact whole content (with whitespace-normalization options); `toMatchTextContent("Saved")` or `/saved/i` checks intended substring/regex content. Negated exact content excludes only equality; use `.not.toMatchTextContent("error")` to exclude that substring. Broaden a matcher only when the intended contract supports it. [Browser assertions](https://vitest.dev/api/browser/assertions).

Vitest browser `page` is not standalone Playwright `Page`: do not assume goto/route/evaluate/keyboard APIs there. Complete navigation/request-routing flows use the existing Playwright runner. Browser Mode custom server commands are a separate advanced API requiring installed-version verification.

## Failure artifacts

Inspect failure output and reported paths first. Generated screenshots have appeared under `.vitest/attachments/failure-screenshots` and older `tests/__screenshots__`; these are not automatically approved snapshots. Keep generated artifacts out of commits.

Vitest browser traces are not enabled in config. When diagnosis warrants them, a scoped run can use `npm run test:browser -- <file> --browser.trace=retain-on-failure`; capture is optional, not required for every run. Default traces are next to tests under `__traces__` unless configured otherwise. Open an available zip with `npx playwright show-trace <path>` and verify provider support. Standalone Playwright already retains failed-run traces under its results output; these differ from Vitest traces. [Playwright traces in Vitest](https://vitest.dev/guide/browser/playwright-traces).
