---
'foldkit': minor
'@foldkit/ui': patch
---

Add Widget #5 of 54: reusable `Presence` block and core `Disclosure` / `Accordion` Part in `foldkit/behavior` reusing `RovingFocus`, keeping `@foldkit/ui`'s `Disclosure` working as a thin painter over those core rules.

- `foldkit/behavior` gains `Presence` (a framework-free `Machine.define` enter/leave mount lifecycle covering `Closed -> EnterStart -> EnterAnimating -> Open -> LeaveStart -> LeaveAnimating -> Closed`, animated and non-animated transitions, interruptible reversals, stale-event guards, and pure readings `isMounted`, `isVisible`, `isShowing`, `isAnimating`, `dataStateOf`, and `transitionPhaseOf`).
- `foldkit/behavior` gains `Disclosure` (a `Machine.define` + `Part.define` Part synced by default under `Navigation` with `Disclosure.deviceOnly()` / `Disclosure.make({ sync: 'OwnView' })`, covering both single collapsible/disclosure and multi-item accordion with single/multiple open, `isCollapsible`, disabled guards, optional animated `Presence` phases, horizontal/vertical LTR/RTL `RovingFocus` over headers, element IDs, and reference-stable `SlotBinding` projections).
- `foldkit/behavior` `Slot.Role` adds `'Region'` (mapping to `role="region"` via `Slot.ariaOf`) with zero painter edits required across HTML, React, or React Native.
- `foldkit/test` gains `DisclosureFixture` proving both single disclosure and multi-item accordion across HTML, React, and React Native generic hosts with zero Disclosure-specific painter code.
- `@foldkit/ui`'s `Disclosure` delegates its element IDs (`buttonId`, `panelId`) and keyboard toggle rules (`resolveKeyToggle`) to `foldkit/behavior` while keeping every public export and signature intact.
