---
'foldkit': minor
'@foldkit/ui': patch
---

Add Widget #4 of 54: core `Popover` Part in `foldkit/behavior` reusing `Placement`, `Layers`, and `FocusScope`, while keeping `@foldkit/ui`'s `Popover` working as a thin painter over those core rules.

- `foldkit/behavior` gains `Popover`, a `Machine.define` + `Part.define` Popover Part synced by default (`Navigation` category, `Pace.Synced`) with a `Popover.deviceOnly()` / `sync: 'OwnView'` option. It covers open/close/toggle/dismiss, mouse pointer-down vs click toggle suppression (`PressedPointerOnButton` / `ClickedPopoverButton` / `IgnoredMouseClick`), panel blur dismissal without returning focus (`BlurredPopoverPanel`), `contentFocus` focus handoff, modal vs non-modal hygiene declarations (`hygieneOf`), layer-aware Escape and outside-press dismissal via `Layers`, focus trapping/wrapping/return via `FocusScope`, anchor placement via `Placement.place` (`placeFor`), element IDs (`buttonId`, `panelId`, `backdropId`, `titleId`, `descriptionId`, `closeButtonId`), and reference-stable `SlotBinding` projections with full WAI-ARIA.
- `foldkit/test` gains `PopoverFixture` for verifying the core `Popover` Part across HTML, React, and React Native generic hosts with zero Popover-specific painter logic.
- `@foldkit/ui`'s `Popover` delegates its element IDs (`buttonId`, `panelId`) and pure rules (leaving/visibility, pointer-down toggle/suppression, button click, panel blur, and trigger/panel keyboard decisions) to `foldkit/behavior` while keeping every public export and signature intact.
