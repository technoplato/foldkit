---
'foldkit': minor
'@foldkit/ui': patch
'@foldkit/react-native': patch
---

Add Widget #6 of 54: core `Switch` Part in `foldkit/behavior`, while keeping `@foldkit/ui`'s `Switch` working as a thin painter over those core rules.

- `foldkit/behavior` gains `Switch`, a `Machine.define` + `Part.define` Switch Part (`Off` | `On`) synced by default (`Domain` category, `Pace.Synced`) with a `Switch.deviceOnly()` / `sync: 'OwnView'` option. It covers `ToggleSwitch`, `SetSwitchChecked`, `TurnSwitchOn`, `TurnSwitchOff`, `PressedSwitchKey`, `ResetSwitch`, disabled and read-only guards, required/name/value/form metadata, `formValueOf`, `isToggleKey` / `isActivationKey`, `nextCheckedOf`, element IDs (`controlId`, `labelId`, `descriptionId`, `thumbId`, `hiddenInputId`), and reference-stable `SlotBinding` projections (`Control`, `Label`, `Description`) with full WAI-ARIA.
- `foldkit/behavior` `Slot` gains generic `'Switch'` role plus `isChecked` (`boolean | 'mixed'`), `isReadOnly`, and `isRequired` fields mapped to `aria-checked`, `aria-readonly`, and `aria-required` in `Slot.ariaOf`, and `@foldkit/react-native`'s generic host maps `isChecked` to `accessibilityState.checked` and pressable `Slot.Role` values to `accessibilityRole`.
- `foldkit/test` gains `SwitchFixture` proving the core `Switch` Part across HTML, React, and React Native generic hosts with zero Switch-specific painter logic.
- `@foldkit/ui`'s `Switch` keeps every public export and signature intact while delegating its element IDs (`labelId`, `descriptionId`), toggle key check, next-checked/disabled guard, and form value rule to `foldkit/behavior`.
