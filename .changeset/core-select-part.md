---
'foldkit': minor
'@foldkit/ui': patch
---

Add Widget #16 of 54: core `Select` Part in `foldkit/behavior` reusing `Placement`, `Layers`, `Typeahead`, `RovingFocus`, and `Selection`, while keeping `@foldkit/ui`'s `Select` working as a thin painter over those core rules.

- `foldkit/behavior` gains `Select`, a `Machine.define` + `Part.define` Select Part (`Closed` | `Open`) composing `Placement`, `Layers`, `Typeahead`, `RovingFocus`, and `Selection`, synced by default (`Domain` category, `Pace.Synced`) with `Select.make` and `Select.deviceOnly()`. It covers single and optional multiple selection, opening via click/Enter/Space/ArrowDown/ArrowUp, closing via Escape/outside press/Tab/Alt+ArrowUp/select-in-single-mode (with `Layers` dismissable stack rules), highlighted option navigation via `RovingFocus`, debounced typeahead both while closed (selecting matching options directly in single mode) and while open (highlighting matching options) via `Typeahead` and `Command.answerAfter` (`WaitToClearSelectSearch`), `Placement.placeFor` popup geometry, disabled/readOnly/required/invalid guards, `atRest` (closing open popups while preserving selection), element IDs, pure helpers (`descriptionId`, `canSelect`, `isDisabledOf`, `isInvalidOf`, `selectedOptionsOf`, `displayLabelOf`), and reference-stable `SlotBinding` projections (`Trigger`, `Content`, `Option`, `Label`, `Description`, `Error`, `Backdrop`, `ClearButton`).
- `foldkit/behavior` `Slot` gains generic `'Combobox'` (`combobox`) role for combobox trigger bindings.
- `foldkit/test` gains `SelectFixture` proving the core `Select` Part across HTML, React, and React Native generic hosts with zero Select-specific painter logic.
- `@foldkit/ui`'s `Select` keeps every public export and signature intact while delegating `descriptionId`, `isDisabledOf`, `isInvalidOf`, and `canSelect` to `foldkit/behavior`, consolidates its `foldkit/html` imports from 3 to 1 (lowering `@foldkit/ui` `domImports` by 2), and adds `scene.test.ts`.
