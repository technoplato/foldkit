---
'foldkit': minor
'@foldkit/ui': patch
---

Add Widget #11 of 54: reusable `HoverIntent` block and core `Tooltip` Part in `foldkit/behavior` (reusing `Placement` and `TimedHint`), while keeping `@foldkit/ui`'s `Tooltip` working as a thin painter over those core rules.

- `foldkit/behavior` gains `HoverIntent`, a framework-free `Machine.define` hover/focus intent block (`Closed` | `Opening` | `Open` | `Closing`) built on `Command.answerAfter` (`WaitBeforeOpening`, `WaitBeforeClosing`), tracking trigger/panel hover and focus engagement, pointer-type focus discrimination (mouse click focus does not affirm open; keyboard/touch/pen focus does), Escape dismissal until full disengage, monotonic `openVersion`/`closeVersion` stale-timer guards, and pure safe-triangle / pointer-corridor geometry (`isPointInTriangle`, `isPointInRect`, `isPointInPolygon`, `safeTriangleOf`, `isMovingTowardPanel`).
- `foldkit/behavior` gains `Tooltip`, a `Machine.define` + `Part.define` Tooltip Part (`Closed` | `Open`) composing `HoverIntent`, `Placement` (`placeFor`), and `TimedHint` (optional `autoHideMs`), synced by default (`Navigation` category, `Pace.Synced`) with a `Tooltip.deviceOnly()` / `sync: 'OwnView'` option. It covers `EnterTooltipTrigger`, `LeaveTooltipTrigger`, `EnterTooltipPanel`, `LeaveTooltipPanel`, `FocusTooltipTrigger`, `BlurTooltipTrigger`, `FocusTooltipPanel`, `BlurTooltipPanel`, `PressTooltipPointer`, `PressTooltipEscape`, `ShowTooltip`, `HideTooltip`, `ElapsedTooltipShow`, `ElapsedTooltipClose`, `ElapsedTooltipAutoHide`, `showDelayMs` (`500` default), `closeDelayMs` (`0` default), `isDisabled`, `isInteractive` (`false` default), element IDs (`triggerId`, `panelId`, `contentId`), `atRest`, and reference-stable `SlotBinding` projections (`Trigger`, `Content`) with `role="tooltip"` and conditional `aria-describedby`.
- `foldkit/behavior` `Slot` gains generic `'Tooltip'` (`tooltip`) role in `Role` and `roleNames`.
- `foldkit/test` gains `TooltipFixture` proving the core `Tooltip` Part across HTML, React, and React Native generic hosts with zero Tooltip-specific painter logic.
- `@foldkit/ui`'s `Tooltip` keeps every public export and signature intact while delegating `triggerId`, `contentId`, default `500 ms` show delay, Escape key check, mouse-vs-affirming-focus discrimination, and monotonic stale-version guards to `foldkit/behavior`.
