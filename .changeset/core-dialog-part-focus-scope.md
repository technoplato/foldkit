---
'foldkit': minor
'@foldkit/ui': patch
---

Add Widget #2 of 54: core `Dialog` Part and its reusable framework-free `FocusScope` block in `foldkit/behavior`, keeping `@foldkit/ui`'s `Dialog` working as a thin painter over those core rules.

- `foldkit/behavior` gains `FocusScope` (pure active focus-scope stack with pause/resume for nested scopes, initial focus target resolution, Tab / Shift+Tab trapping and wrapping, outside-focus reclamation with branch support, and return-focus restoration) and `Dialog` (a `Machine.define` + `Part.define` Dialog Part synced by default with a `Dialog.deviceOnly()` option, covering `dialog` and `alertdialog` roles, modal/non-modal hygiene declarations, layer-aware Escape/outside-press dismissal, element ID helpers, and reference-stable `SlotBinding` projections).
- `foldkit/behavior` `Slot` adds `Dialog` and `AlertDialog` roles plus optional ARIA projection properties (`isModal`, `labelledBy`, `describedBy`, `controls`, `hasPopup`) so generic hosts render dialog ARIA with zero Dialog-specific painter code.
- `foldkit/test` gains `DialogFixture` for verifying the core `Dialog` Part across HTML, React, and React Native generic hosts with zero Dialog-specific painter logic.
- `@foldkit/ui`'s `Dialog` delegates its element IDs (`titleId`, `descriptionId`, `panelId`) and open/close/visibility/unmount rules to `foldkit/behavior` while keeping every public export and signature intact.
