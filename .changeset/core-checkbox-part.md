---
'foldkit': minor
'@foldkit/ui': patch
'@foldkit/react-native': patch
---

Add Widget #7 of 54: core `Checkbox` Part in `foldkit/behavior`, keeping `@foldkit/ui`'s `Checkbox` working as a thin painter over those core rules.

- `foldkit/behavior` gains `Checkbox` (a `Machine.define` + `Part.define` Part with discriminated union state `Unchecked | Checked | Indeterminate`, synced by default under `Domain` with `Checkbox.deviceOnly()` / `Checkbox.make({ sync: 'OwnView' })`, covering `ToggleCheckbox`, `CheckCheckbox`, `UncheckCheckbox`, `SetCheckboxChecked`, `SetCheckboxIndeterminate`, `PressedCheckboxKey`, disabled and readOnly guards, required/invalid/name/value form metadata, Space-only WAI-ARIA keyboard toggling, `ariaCheckedOf`, `dataStateOf`, `formValueOf`, element IDs, and reference-stable `Control` / `Label` / `Description` `SlotBinding` projections).
- `foldkit/behavior` `Slot` adds `'Checkbox'` to `Role` (`role="checkbox"`) and generic `isChecked` (`boolean | 'mixed'` -> `aria-checked`), `isReadOnly` (`aria-readonly`), `isRequired` (`aria-required`), and `isInvalid` (`aria-invalid`) ARIA projection fields.
- `@foldkit/react-native` generic `host.ts` projects `Slot.isChecked` into native `accessibilityState.checked` (`boolean | 'mixed'`) with zero Checkbox-specific painter logic.
- `foldkit/test` gains `CheckboxFixture` proving the core Checkbox Part across HTML, React, and React Native generic hosts.
- `@foldkit/ui`'s `Checkbox` delegates its element IDs (`labelId`, `descriptionId`), toggle key rule, `aria-checked`, `data-state`, and form-value rules to `foldkit/behavior` while keeping every public export and signature intact.
