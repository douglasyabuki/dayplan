---
name: vitest-testing
description: Author, review, and debug Dayplan Vitest Node and real-browser tests, and select regression checks for application changes affecting domain logic, persistence, synchronization, account lifecycles, or UI behavior. Use the existing Playwright runner when confidence requires complete application flows.
---

# Vitest testing

Choose the smallest boundary that verifies the intended behavior. New tests are useful for meaningful contracts and reproducible regressions; trivial edits do not automatically need tests.

## Start with the contract

- Read applicable AGENTS.md instructions, inspect the affected implementation and callers, and consult [the repository map](references/repository.md) for versions, runners, fixtures, and commands. Recheck its dated baseline against current installed packages, lockfile, configuration, and declarations before adopting APIs. Preserve existing work; testing guidance does not authorize upgrades or unrelated changes.
- Derive expectations from requirements, contracts, and independently understandable examples. Existing tests establish conventions but may encode bugs. For reproducible bugs, prefer demonstrating a behavioral failure before fixing it; an import or harness failure is not proof of a regression. Do not change expectations merely to match faulty implementation behavior.
- Use Node for suitable domain/persistence logic, Browser Mode for rendered UI/provider behavior, and Playwright for complete application flows. Read [testing decisions and review](references/decisions.md) when selecting assertions or evaluating a suite.

## Read details only when needed

- [Mocking and async isolation](references/isolation.md): factories, external boundaries, races, fake timers, and cleanup.
- [Browser behavior](references/browser.md): mounting lifetime, accessible interactions, keyboard/focus, retrying assertions, and artifacts.
- [Dayplan scenarios](references/scenarios.md): recurrence, grouped commands, save/sync contracts, accounts, recovery, and database isolation. Select relevant scenarios; this is not a required catalog for every task.
- [Verification and diagnosis](references/verification.md): targeted non-watch checks, discovery, types, coverage, and accurate reporting.

Preserve intended contracts. Do not weaken assertions, add unexplained skips, accept snapshots automatically, or add retries to conceal failures. Review the final diff and report checks actually executed, including failures and infrastructure blocks.
