---
'foldkit': minor
'@foldkit/ui': patch
'@foldkit/react-native': patch
---

Add Widget #18 of 54: reusable `PointerDrag` block with `Pace.Sampled` and core `Slider` Part in `foldkit/behavior`, while keeping `@foldkit/ui`'s `Slider` working as a thin painter over those core rules.

- `foldkit/behavior` gains `PointerDrag`, a framework-free `Machine.define` pointer-drag block (`Idle` | `Dragging`) syncing pointer moves via `Pace.Sampled({ everyMs: 50 })` and start/commit/cancel via `Pace.Synced()`. It models activation threshold (`thresholdPx`), `DragAxis` (`Horizontal` | `Vertical` | `Both`), RTL and inverted polarity, pointerId matching, Escape/pointercancel cancellation with captured `originValue`, `atRest`, pure geometry and step math (`clampValue`, `snapToStep`, `fractionFromPoint`, `fractionsFromPoint`, `valueFromFraction`, `fractionFromValue`, `stepValue`), and pure readings (`isDragging`, `pointerIdOf`, `deltaOf`, `axisDeltaOf`, `paceOf`).
- `foldkit/behavior` gains `Slider`, a `Machine.define` + `Part.define` Slider Part (`Idle` | `Focused` | `Dragging`) composing `PointerDrag`, synced by default (`Domain` category) with `Pace.Sampled` on drag moves and `Pace.Synced` on discrete steps/commits/cancels, plus `Slider.make` and `Slider.deviceOnly()`. It covers single-thumb and multi-thumb range sliders, `min`/`max`/`step`/`largeStep`, `minStepsBetweenThumbs`, thumb collision modes (`None` | `Push` | `Swap`), horizontal and vertical orientation, RTL and inversion, keyboard navigation (`resolveSliderKey`), track press, thumb drag, Escape cancel restoring origin values, `atRest`, element IDs, and reference-stable `SlotBinding` projections (`Root`, `Track`, `Range`, `Thumb`, `Label`).
- `foldkit/behavior` `Slot` gains generic `'Slider'` (`slider`) role plus optional `valueMin`, `valueMax`, `valueNow`, and `valueText` fields mapping to `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-valuetext` in `Slot.ariaOf`, and `@foldkit/react-native`'s generic host maps those to `accessibilityRole="adjustable"` and `accessibilityValue`.
- `foldkit/test` gains `SliderFixture` proving the core `Slider` Part across HTML, React, and React Native generic hosts with zero Slider-specific painter logic.
- `@foldkit/ui`'s `Slider` keeps every public export and signature intact while delegating snapping, clamping, fraction math, pointer-to-value conversion, keyboard navigation, cancel key detection, percentage formatting, and element IDs to `foldkit/behavior` with zero painter ratchet rises.
