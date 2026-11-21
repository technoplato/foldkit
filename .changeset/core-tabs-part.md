---
'foldkit': minor
'@foldkit/ui': patch
'@foldkit/react': patch
'@foldkit/react-native': patch
---

Add Widget #3 of 54: core `Tabs` Part in `foldkit/behavior` reusing `RovingFocus`, keeping `@foldkit/ui`'s `Tabs` working as a thin painter over those core rules.

- `foldkit/behavior` gains `Tabs` (a `Machine.define` + `Part.define` Tabs Part synced by default under `Navigation` with `Tabs.deviceOnly()` / `Tabs.make({ sync: 'OwnView' })`, supporting horizontal/vertical orientation, LTR/RTL reading direction, automatic and manual activation modes, looping/clamping, disabled tabs, optional deselection, element IDs, and reference-stable `SlotBinding` projections).
- `foldkit/behavior` `Slot` and the generic `Row` / `Column` / `Box` hosts gain generic ARIA slot attributes (`TabList`, `TabPanel`, `isSelected`, `orientation`, `controlsId`, `labelledById`, `tabIndex`, `isHidden`) rendered uniformly across HTML, React, and React Native with zero Tabs-specific painter code.
- `foldkit/test` gains `TabsFixture` proving the core `Tabs` Part across HTML, React, and React Native generic hosts.
- `@foldkit/ui`'s `Tabs` delegates its keyboard navigation, activation mode rules, schemas, and element IDs to `foldkit/behavior` while keeping every public export and signature intact.
