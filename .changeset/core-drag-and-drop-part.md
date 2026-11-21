---
'foldkit': minor
'@foldkit/ui': patch
---

Add Widget #22 of 54: core `DragAndDrop` Part reusing `PointerDrag` and `Pace.Sampled` in `foldkit/behavior`, while keeping `@foldkit/ui`'s `DragAndDrop` working as a thin painter over those core rules.

- `foldkit/behavior` gains `DragAndDrop`, a `Machine.define` + `Part.define` Part (`Idle` | `Pending` | `Dragging` | `KeyboardDragging`) composing `PointerDrag`, synced by default (`Domain` category) with `Pace.Sampled({ everyMs })` on `MovePointerDrag` and `Pace.Synced()` on lift, keyboard move, drop, and cancel, plus `DragAndDrop.make` and `DragAndDrop.deviceOnly()`.
- Provides pointer drag activation threshold (`activationDistancePx`, default 5 px via `PointerDrag`), `pointerId` tracking, origin container and index tracking, full keyboard drag-and-drop (Space/Enter lift and drop, arrow keys and Tab/Shift+Tab within and across containers in `Vertical` and `Horizontal` orientations, Escape cancel restoring origin), pure collision detection, rect distance/intersection, insertion index, auto-scroll, and reorder helpers (`findClosestTarget`, `findMostIntersectingTarget`, `computeInsertionIndex`, `resolveDropTargetFromBounds`, `computeReorder`, `moveItem`, `moveBetweenLists`, `moveItemAcrossContainers`, `computeAutoScrollDelta`), accessible live announcements (`announcementOf`), `atRest`, and reference-stable `SlotBinding` projections (`Draggable`, `Droppable`, `LiveRegion`).
- `foldkit/test` gains `DragAndDropFixture` proving the core `DragAndDrop` Part across HTML, React, and React Native generic hosts with zero DragAndDrop-specific painter logic.
- `@foldkit/ui`'s `DragAndDrop` keeps every public export and signature intact while delegating activation threshold, reorder, insertion index, keyboard movement, key matching, and auto-scroll rules to `foldkit/behavior` with zero painter ratchet rises.
