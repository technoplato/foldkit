---
'foldkit': minor
'@foldkit/ui': patch
---

Add Widget #1 of 54: core `Menu` Part and its three reusable framework-free blocks (`Layers`, `RovingFocus`, `Typeahead`) in `foldkit/behavior`, keeping `@foldkit/ui`'s `Menu` working as a thin painter over those core rules.

- `foldkit/behavior` gains `Layers` (pure dismissable-layer stack readings for Escape, outside press, nested dismissal, and modal pointer blocking), `RovingFocus` (pure keyboard index navigation across enabled items with orientation, direction, wrapping, and Home/End support), `Typeahead` (pure prefix matching + `Machine.define` debounced reset driven by `Command.answerAfter`), and `Menu` (a `Machine.define` + `Part.define` Menu Part synced by default with a `Menu.deviceOnly()` option and reference-stable `SlotBinding` projections).
- `foldkit/test` gains `MenuFixture` for verifying the core `Menu` Part across HTML, React, and React Native generic hosts with zero Menu-specific painter logic.
- `@foldkit/ui`'s `Menu`, `typeahead`, and `keyboard` delegate their rules to `foldkit/behavior` while keeping every public export and signature intact.
