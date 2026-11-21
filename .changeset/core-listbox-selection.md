---
'foldkit': minor
'@foldkit/ui': patch
---

Add Widget #15 of 54: reusable `Selection` block and core `Listbox` Part in `foldkit/behavior` (reusing `RovingFocus` and `Typeahead`), while keeping `@foldkit/ui`'s `Listbox` (single + `Multi`) working as a thin painter over those core rules.

- `foldkit/behavior` gains `Selection`, a framework-free `Machine.define` selection block (`Empty` | `Selected`) supporting `Single` and `Multiple` modes, `deselectable` guards, ordered selectable items (skipping disabled items), anchor and range-end tracking for Shift/extended range selection (`select`, `deselect`, `toggle`, `selectRange`, `selectAll`, `clear`, `replace`, `reconcile`), and pure readings (`selectedOf`, `firstSelectedOf`, `isSelected`, `selectedCountOf`, `anchorOf`, `isAllSelected`, `isEmpty`).
- `foldkit/behavior` gains `Listbox`, a `Machine.define` + `Part.define` Listbox Part (`Idle` | `Focused`) composing `Selection`, `RovingFocus`, and `Typeahead`, synced by default (`Domain` category, `Pace.Synced`) with `Listbox.make` and `Listbox.deviceOnly()`. It covers single and multiple selection, horizontal and vertical orientation, active-descendant tracking, Arrow/Home/End/PageUp/PageDown navigation, Space/Enter select/toggle, Shift+Arrow and Shift+Click range selection, Mod+A select-all, Escape clear when deselectable, debounced typeahead via `Typeahead` and `Command.answerAfter`, disabled items, `atRest`, element IDs, and reference-stable `SlotBinding` projections (`Listbox`, `Option`, `Label`).
- `foldkit/behavior` `Slot` gains generic `'Listbox'` (`listbox`) and `'Option'` (`option`) roles plus optional `isMultiselectable` (`aria-multiselectable="true"` when `true`).
- `foldkit/test` gains `ListboxFixture` proving the core `Listbox` Part across HTML, React, and React Native generic hosts with zero Listbox-specific painter logic.
- `@foldkit/ui`'s `Listbox` (single and `Multi`) keeps every public export and signature intact while delegating orientation/navigation keys, first/last enabled lookup, typeahead progression/debounce, pointer hover deduplication and leave checks, selection membership, and element IDs to `foldkit/behavior` with zero painter ratchet rises.
