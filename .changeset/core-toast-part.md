---
'foldkit': minor
'@foldkit/ui': patch
'@foldkit/react-native': patch
---

Add Widget #10 of 54: reusable `TimedHint` block and core `Toast` Part in `foldkit/behavior` (reusing `Presence`), while keeping `@foldkit/ui`'s `Toast` working as a thin painter over those core rules.

- `foldkit/behavior` gains `TimedHint`, a framework-free `Machine.define` versioned timed-visibility / auto-dismiss block (`Hidden` | `Active` | `Paused`) built on `Command.answerAfter` (`WaitForHintElapsed`), covering `ShowHint`, `PauseHint`, `ResumeHint`, `DismissHint`, `ElapsedHint`, sticky/infinite mode (`maybeDurationMs: None`), stale-version rejection, and pure readings (`isVisible`, `isActive`, `isPaused`, `isSticky`, `versionOf`, `durationMsOf`, `shouldAcceptElapsed`, `nextVersion`, `fromFields`).
- `foldkit/behavior` gains `Toast`, a `Machine.define` + `Part.define` Toast Part (`Empty` | `Showing`) composing `TimedHint` and `Presence`, synced by default (`Navigation` category, `Pace.Synced`) with a `Toast.deviceOnly()` / `sync: 'OwnView'` option. It covers `ShowToast`, `DismissToast`, `DismissAllToasts`, `HoverToast`, `LeaveToast`, `AdvanceToastFrame`, `EndToastAnimation`, `ElapsedToast`, `Variant` (`Info`, `Success`, `Warning`, `Error`) driving `Status`/`Alert` and `Polite`/`Assertive` live regions, `Position` placements, `defaultDurationMs`, sticky entries, optional `maxVisible` cap, pause-on-hover/focus, `atRest` clearing transient toasts, element IDs (`regionId`, `entryId`, `titleId`, `descriptionId`, `dismissButtonId`), and reference-stable `SlotBinding` projections (`Region`, `Entry`, `Title`, `Description`, `DismissButton`).
- `foldkit/behavior` `Slot` gains generic `'Status'` (`status`) and `'Alert'` (`alert`) roles plus `live` (`Off` | `Polite` | `Assertive` -> `aria-live`) and `isAtomic` (`aria-atomic`), and `@foldkit/react-native`'s generic host maps generic `'Alert'` and `live` to `accessibilityRole` and `accessibilityLiveRegion`.
- `foldkit/test` gains `ToastFixture` proving the core `Toast` Part across HTML, React, and React Native generic hosts with zero Toast-specific painter logic.
- `@foldkit/ui`'s `Toast` keeps every public export and signature intact (including `Toast.test.drainEntry`) while delegating `Variant`, `Position`, default duration/label, entry ID generation, `variantToRole`, leaving checks, and versioned elapsed-duration / hover-pause guards to `foldkit/behavior`.
