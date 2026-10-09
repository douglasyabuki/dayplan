# Repository interaction map

Paths are relative to the repository root. Re-read the affected implementations; this is a behavior map, not frozen architecture.

## Shared task provider and domain path

`components/workspace/workspace-shell.tsx` owns a `DragDropProvider` with default configuration and controller start/move/over/end handlers. It connects task surfaces and sidebar project targets. `contexts/workspace-controller.tsx` resolves geometry, keyboard direction, previews and final actions; `lib/tasks/drag.ts` owns `taskPointerIntent`, `dragDestination`, `previewOrder`, and `taskPreviewEntries`. `lib/tasks/operations.ts`, `hierarchy.ts`, and `recurrence.ts` retain domain validity and task/occurrence distinctions.

The controller uses generation-guarded microtasks for preview/cleanup and defers the final commit until dnd-kit's operation can finish. Retain the reason for this sequencing when refactoring: unregistering nested sources can emit events during React insertion-effect cleanup. Invalid-hover retention and final fallback to a previous destination deserve explicit transition tests, not broad removal of all retention.

`components/workspace/workspace-overlays.tsx` keeps `DragOverlay` mounted with `dropAnimation={null}`. The controller makes an inert, aria-hidden DOM snapshot with IDs removed and scroll positions saved; `components/tasks/task-drag-feedback.tsx` renders it and the detach target. Preview cards must not become registered draggable/droppable copies.

## Calendar scheduling

- `components/tasks/task-calendar.tsx`: `useDraggable`, `${context}:${task.id}` IDs, `data.kind: "calendar-task"`, `taskId`, `dayOffset`; dedicated `handleRef` button with `touch-none`. Uses default sensors and no task-card sensor override.
- Completed tasks and non-tray deadline-only cards are disabled. Preserve tray versus calendar distinctions and mobile handle visibility.
- Calendar target data supplies `kind: "calendar"`, date, mode and optional time. `finishDrop` in the controller subtracts `dayOffset`; time slots set time, month drops retain existing time, and other calendar modes clear time. Duration is retained or defaults to 30 minutes. Follow the existing `save` path for recurring edits.
- Do not apply tag vertical restrictions or task nesting rules here. Changing activation, snapping or feedback must preserve scheduling semantics and cross-feature targets.

## Inbox, project lists/boards, and nested tasks

- `task-item.tsx` exports `taskCardSensors`: pointer activation excludes interactive descendants and other nested cards but permits title dragging; keyboard activation preserves control protection. `task-interaction.ts` supplies interaction boundaries, including portaled controls.
- `task-groups.tsx` registers `row`; `task-sections.tsx` registers `section-task`; `task-item.tsx` registers nested tasks. Each uses task-card sensors and only `SortableKeyboardPlugin` as its sortable plugin array. Archived cards are disabled.
- `TaskItem` is shared presentation; adapters own registration. Preserve occurrence IDs in `data.taskId` and existing registration prefixes rather than treating every rendering of a recurring task as the template ID.
- Group identities include parent/location and, where applicable, completion status. React previews reorder mounted siblings; incoming destination cards are presentation-only so the original source stays mounted.
- Nesting uses a narrow title-center band, capped horizontal title extent, and list-mode hysteresis. Other card areas reorder. These fine-tuned values in `taskPointerIntent` are UX decisions, not arbitrary cleanup targets.
- `dragDestination` rejects cycles (including occurrence-only cycles), archived targets, positional drops under incompatible sorting or incomplete visible sibling sets, and invalid recurrence/status placements. Location moves and permitted nested ordering differ from root positional reorder.
- Nested target priorities increase with depth; children areas are `depth + 1.5`, nested cards `depth + 1`, top-level section cards `1`. Keep eligibility and priority distinct from domain validation.

## Sections, status buckets, and sidebar projects

- `task-sections.tsx`: section drags use a handle, `type/accept: "section"`, default sensors, and `SortableKeyboardPlugin`. Unsectioned is not draggable. Board section placement uses the horizontal midpoint; list placement uses vertical geometry.
- Section task destinations use `section-target` with priority `-1`, accepting task rows by data kind. Empty sections remain valid destinations.
- `task-status-groups.tsx`: buckets accept task source types, carry location/completed metadata, use priority `depth + (collapsed ? 2 : 0.5)`, and expand after 400 ms hover. Preserve parent, status-only changes, and recurrence checks when moving between buckets.
- `task-drag-feedback.tsx`: detach target priority `2`, only for rows/section tasks that have a section or parent. Detaching must retain descendants.
- `workspace-sidebar.tsx`: project/Inbox targets use unique rendered target IDs, an enabled gate, and task-ID acceptance. Explicit Inbox clears project/section through the domain path. Preserve vertical auto-scroll without horizontal sidebar drift.

## Tag tree

`components/collections/tag-tree.tsx` owns a separate nested provider; its settings are not task defaults.

- Local `tagSensors` permits pointer activation on labels plus keyboard input; local Feedback disables drop animation. Provider modifier is `RestrictToVerticalAxis`.
- Custom row collision checks vertical bounds with a small inset, independent of pointer X; keyboard uses `pointerIntersection`. Pointer destination resolution uses initial row slots relative to the scrolling tree, avoiding preview-driven hit-region changes.
- Top/bottom quarters reorder; middle nests; root target promotes to top level. Keyboard resolution uses inside placement. Reject self/descendant cycles and preserve entire subtrees.
- Preserve label clicks, menu actions, cancellation, collapsed state, and live feedback. Do not reuse the broad tag activation override for task metadata controls.
