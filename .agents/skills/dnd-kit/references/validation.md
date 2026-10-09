# Scenario validation

Choose checks based on the changed behavior. These are representative contracts, not a requirement to run the entire suite for every edit.

| Request/scenario | Expected decisions and observations | Existing evidence/checks |
| --- | --- | --- |
| Adjust calendar activation | Scope sensors to calendar cards; retain keyboard and handle behavior. Check tray to time slot, month date movement, all-day time clearing, multi-day offset, duration, completed/deadline-only restrictions, cancel, recurring save. Task-title dragging must remain unchanged. | `task-calendar.tsx`, controller `finishDrop`; no dedicated calendar drag E2E found in the reviewed test inventory, so perform a targeted browser check or add coverage when changing this feature. |
| Fix inbox/board cross-section preview | Keep source mounted, preview in exact destination slot, commit matching order. Move through populated and empty sections, return to source, leave all targets, Escape. Avoid enabling optimistic DOM sorting alongside React previews. | `tests/unit/drag-preview.unit.test.ts`, `drag-transitions.unit.test.ts`, `drag.unit.test.ts`. |
| Change nesting or recurring child movement | Preserve title-band before/inside/after behavior, cycle rejection, occurrence parent, descendants, and restrictions on sorted/filtered views. Distinguish location moves from positional reorder. | Same drag unit suites; `tests/unit/task-operations.unit.test.ts`. |
| Tune status hover | Check 400 ms expansion, collapsed/empty nested buckets, keyboard transfer, complete/reopen, parent retention and Undo in list and board. Test leaving before the timer fires. | `tests/e2e/status-groups.spec.ts`. |
| Fix task control activation | Title/ordinary space still drag; checkbox, metadata, links, menus and portaled controls keep their own interactions. Nested child activation must not drag its parent. | `tests/e2e/task-actions.spec.ts`, especially metadata/portaled-control activation case. |
| Adjust sidebar scrolling | Cross-project and Inbox drops work; horizontal position remains stable while long project lists scroll vertically. Do not solve this with a workspace-wide axis lock that breaks boards/calendar. | `tests/e2e/sidebar-drag.spec.ts`; Inbox destination checks in drag transitions. |
| Improve tag-tree implementation | Keep own provider/configuration; sideways pointer drift must not change target, preview reflow must not destabilize it, edge/middle/root intent remains distinct, Escape and descendant drops make no mutation. Verify keyboard and menu alternatives. | `tests/e2e/tag-hierarchy.spec.ts`, `tests/unit/tags.unit.test.ts`. |
| Refactor section drag | Handle activation, list vertical versus board horizontal placement, non-draggable Unsectioned, cancellation and section-only acceptance stay intact. | Section case in `drag-transitions.unit.test.ts`; browser check actual section drag (section-actions E2E mainly covers menus). |

For future application changes, run focused commands from the repository root, for example:

```powershell
npm run test:unit -- tests/unit/drag.unit.test.ts tests/unit/drag-preview.unit.test.ts tests/unit/drag-transitions.unit.test.ts
npm run test:e2e -- tests/e2e/task-actions.spec.ts tests/e2e/status-groups.spec.ts
npm run test:e2e -- tests/e2e/tag-hierarchy.spec.ts tests/e2e/sidebar-drag.spec.ts
```

Playwright uses local Chrome and can start the Next dev server on localhost:3000; inspect `playwright.config.ts` before running. Use appropriate type/lint checks for code edits. During browser validation, also watch for React insertion-effect warnings, duplicate registrations, focus loss, stale overlays, and unintended persistence. Test touch/pen if changing pointer activation; desktop mouse success does not establish touch behavior.

## Skill creation validation scope

The guide was checked against the installed API declarations and representative source/test paths above. These scenario walkthroughs validate routing and behavioral constraints in the skill; they do not claim a fresh runtime UX pass. Application code must remain untouched when validating this documentation-only creation task.
