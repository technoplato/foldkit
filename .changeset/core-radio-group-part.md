---
'foldkit': minor
'@foldkit/ui': patch
'@foldkit/react-native': patch
---

Add Widget #8 of 54: core `RadioGroup` Part in `foldkit/behavior` (reusing `RovingFocus`), while keeping `@foldkit/ui`'s `RadioGroup` working as a thin painter over those core rules.

- `foldkit/behavior` gains `RadioGroup`, a `Machine.define` + `Part.define` RadioGroup Part (`Idle` | `Focused`) synced by default (`Domain` category, `Pace.Synced`) with a `RadioGroup.deviceOnly()` / `sync: 'OwnView'` option. It covers `SelectRadioOption`, `ClearRadioSelection`, `ResetRadioGroup`, `FocusRadioOption`, `BlurRadioGroup`, `PressedRadioKey`, horizontal/vertical orientation (default `'Vertical'`), LTR/RTL reading direction, looping/clamping, disabled group and per-option disabled guards, read-only focus navigation without selection, required/invalid/name/form metadata, roving-tabindex fallback when a selected option is disabled (`resolveFocusedIndex` / `focusedIndexOf`), `resolveKeyOutcome`, element IDs (`groupId`, `optionId`, `labelId`, `descriptionId`, `hiddenInputId`), and reference-stable `SlotBinding` projections (`Group`, `Option`, `Label`, `Description`) with full WAI-ARIA.
- `foldkit/behavior` `Slot` gains generic `'RadioGroup'` (`radiogroup`) and `'Radio'` (`radio`) roles, and `@foldkit/react-native`'s generic host maps them to React Native `accessibilityRole` values.
- `foldkit/test` gains `RadioGroupFixture` proving the core `RadioGroup` Part across HTML, React, and React Native generic hosts with zero RadioGroup-specific painter logic.
- `@foldkit/ui`'s `RadioGroup` keeps every public export and signature intact while delegating `Orientation`, element IDs (`optionId`, `labelId`, `descriptionId`), roving focus fallback, and keyboard selection rules to `foldkit/behavior`.
