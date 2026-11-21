---
'foldkit': minor
'@foldkit/ui': patch
'@foldkit/react-native': patch
---

Add Widget #9 of 54: core `Toggle` / `Button` Part in `foldkit/behavior`, keeping `@foldkit/ui`'s `Button` working as a thin painter over those core rules.

- `foldkit/behavior` gains `Toggle` (a `Machine.define` + `Part.define` Part with discriminated union state `Unpressed | Pressed`, synced by default under `Domain` with `Toggle.deviceOnly()` / `Toggle.make({ sync: 'OwnView', defaultPressed })`, covering `ToggleButton`, `SetButtonPressed`, `PressButton`, `ReleaseButton`, `PressedButtonKey`, `ResetToggle`, disabled and readOnly guards, `ButtonType` (`'button' | 'submit' | 'reset'`, default `'button'`), `isInteractive`, `canActivate`, `canClick`, `isActivationKey`, `dataStateOf` (`'on' | 'off'`), element IDs (`buttonId`, `labelId`, `descriptionId`), and reference-stable `Button` / `Label` / `Description` `SlotBinding` projections).
- `foldkit/behavior` `Slot` adds generic `PressedState` (`boolean | 'mixed'`) and `isPressed` on `SlotBinding` and `SlotProps`, mapped to `aria-pressed` in `Slot.ariaOf` for reuse across `Toggle` and `ToggleGroup`.
- `@foldkit/react-native` generic `host.ts` projects `Slot.isPressed` into native `accessibilityState` (`selected` for boolean pressed state, `checked: 'mixed'` for mixed state) with zero widget-specific painter logic.
- `foldkit/test` gains `ToggleFixture` proving the core Toggle Part across HTML, React, and React Native generic hosts.
- `@foldkit/ui`'s `Button` delegates its disabled/interactive click guard and default button type to `foldkit/behavior` (`Toggle`) while keeping every public export and signature intact, and gains `scene.test.ts`.
