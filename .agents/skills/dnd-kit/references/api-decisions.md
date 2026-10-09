# API decisions and configuration

Reviewed 2026-10-09. Installed packages: `@dnd-kit/react`, `dom`, `abstract`, `collision`, plus transitive `geometry` and `state`, all **0.5.0**. The first four are direct dependencies; React is declared `^0.5.0`, the others `0.5.0`. `@dnd-kit/helpers` is not installed. React is 19.2.8 and Next.js is 16.3.6. Recheck before relying on this snapshot.

Installed `@dnd-kit/react/index.d.ts`, `sortable.d.ts`, and corresponding `dom`/`abstract` declarations are the compatibility authority. Modern DOM sensors and plugins are valid building blocks for React; importing them is not mixing API generations.

## Choose the React abstraction

Use `useDraggable` for calendar movement or tree placement with domain-specific resolution; use `useSortable` for indexed groups. Connect `ref` to the measured element and `handleRef` to an accessible handle when the interaction calls for one. Use `sourceRef`/`targetRef` only when their geometry differs. Merge refs rather than overwriting registration. Read [useSortable](https://dndkit.com/react/hooks/use-sortable/) for input and return types.

Prefer provider event handlers for commits and React monitor/operation hooks for local observation. Avoid adding a second manually constructed `DragDropManager` inside an existing React provider. Custom low-level sensors/plugins need lifecycle cleanup; see [shared sensors](https://dndkit.com/extend/sensors/) and [plugins](https://dndkit.com/extend/plugins/).

## Configuration choices

| Concern | Options and decision |
| --- | --- |
| Sensors | `PointerSensor.configure` supports `preventActivation` and `activationConstraints`; distance/delay constraints use `PointerActivationConstraints`. Preserve ordinary clicks and choose thresholds per interaction and pointer type. Keep `KeyboardSensor` when replacing a sensor array. |
| Scope | Per-draggable sensors override global sensors. Provider arrays replace defaults; a defaults callback allows extending them. Do not accidentally remove keyboard support. |
| Modifiers | Axis restrictions come from `@dnd-kit/abstract/modifiers`; element/window bounds from `@dnd-kit/dom/modifiers`. Order matters, and local modifiers take precedence over provider modifiers. Use a lazy element getter for a ref-backed boundary. Grid snapping is a visual transform, not a substitute for calendar date/time rules. |
| Collision | Set `collisionDetector` on the target hook. `collisionPriority` resolves competing nested targets; `accept`, `type`, and `disabled` filter eligibility. Inspect default, pointer, shape, or nearest-target algorithms for the specific geometry rather than globally choosing one. |
| Plugins | Provider plugin arrays replace manager defaults, potentially losing accessibility or auto-scroll. A defaults callback extends them. This differs from the app's intentional replacement of sortable-local defaults; do not conflate those scopes. |
| Feedback | Prefer `DragOverlay` for React-rendered feedback; `Feedback.configure` provides per-source feedback/drop-animation options. Keep previews presentation-only to avoid duplicate registrations, focusable clones, or duplicate IDs. |

Detailed official guides: [React sensors](https://dndkit.com/react/guides/sensors/), [React modifiers](https://dndkit.com/react/guides/modifiers/), [collision detection](https://dndkit.com/react/guides/collision-detection/), [React feedback](https://dndkit.com/react/guides/feedback/). For additional lower-level modifier behavior, follow the shared concept links from the [TypeScript quickstart](https://dndkit.com/quickstart/).

Sensor pitfalls: multiple activation constraints are alternatives, not cumulative requirements. Returning `undefined` from an activation-constraints callback does not restore defaults; the documented behavior is immediate activation. A custom `preventActivation` replaces that guard, so explicitly delegate to the default where its interactive-element protection is still wanted. Verify these behaviors against the installed version when changing thresholds.

## Sorting and persistence

The library's default optimistic sorting moves DOM elements during a drag. Under that model, source and target may be the same sortable: use the `isSortable` guard and source `initialIndex/index`, `initialGroup/group` rather than assuming unequal IDs. See [sortable state management](https://dndkit.com/react/guides/sortable-state-management/).

This app chooses a different model for tasks and sections: local `plugins: [SortableKeyboardPlugin]` excludes `OptimisticSortingPlugin` (confirmed in installed `dom/sortable.js`). React renders sibling order and nonregistered incoming previews, then domain operations commit on drop. Preserve this ownership model during routine fixes. A new independent flat list may reasonably use the documented defaults; do not copy this exception indiscriminately. The docs' `move` helper is optional, not a replacement for recurrence-aware domain operations or an already available dependency.

Handle cancellation and absent source/target before persisting. If speculative application state is introduced, define rollback and avoid persistence per hover. Keep React keys, hook registrations, and group/index metadata consistent throughout a drag. Do not remove the controller's deferred updates without reproducing and addressing its insertion-effect/unregistration constraints.

## Review opportunities, not automatic refactors

- `workspace-controller.tsx` combines geometry, event adaptation, presentation snapshots, and domain dispatch. Extract typed adapters or pure geometry only if that reduces complexity without changing intent bands, event ordering, or occurrence identity.
- Both controller pointer hit-testing and `task-status-groups.tsx` manage 400 ms expansion. Investigate overlap and stale timers before consolidating; keyboard and pointer paths may need different detection mechanisms.
- Move/over handlers read layout and enqueue hover updates. Profile render frequency and layout reads before adding caches or memoization; deduplicate equivalent destinations and keep invalidation correct under scrolling, expansion, and resizing.
- The DOM snapshot overlay copies CSS variables, dimensions, and scroll state. Compare a React presentation component or supported Feedback clone only if it can retain that visual fidelity and accessibility. The current snapshot is a mechanism, not a required design forever.
- Tag rows cache initial hit slots to resist preview reflow. Consider typed geometry helpers and focused tests; preserve scrolling and sideways-drift behavior. Audit broad activation overrides with menus and links instead of copying them to task cards.
- Calendar drop targets currently have no explicit `accept` filter. Evaluate stronger typed eligibility only against current cross-feature scheduling behavior; don't silently prohibit task-to-calendar drops.
