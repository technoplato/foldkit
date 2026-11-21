---
'foldkit': minor
'@foldkit/ui': patch
---

Add Widget #19 of 54: reusable `DateGrid` block and core `Calendar` Part in `foldkit/behavior` (reusing `RovingFocus`), while keeping `@foldkit/ui`'s `Calendar` working as a thin painter over those core rules.

- `foldkit/behavior` gains `DateGrid`, a framework-free `Machine.define` calendar grid block (`Day` | `Month` | `Year`) built on Foldkit's Schema-backed `CalendarDate` and `DayOfWeek` without `new Date()` or `Date.now()`. It covers fixed 6-row and variable-week month grids, weekday header rotation (`Sunday`..`Saturday`), pure date arithmetic (`addDays`, `addWeeks`, `addMonths`, `addYears`, `startOfWeek`, `endOfWeek`, `daysInMonth`, `compareDates`, `isSameDate`, `isSameMonth`), constraints (`minDate`, `maxDate`, `disabledDates`, `disabledDaysOfWeek`, `isDateDisabled`, `clampDate`, nearest enabled date search), 2D keyboard navigation (`ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown`/`Home`/`End`/`PageUp`/`PageDown`/`Shift+PageUp`/`Shift+PageDown`, skipping disabled dates), and month/year/decade grid generation for reuse by Calendar (#19) and DatePicker (#20).
- `foldkit/behavior` gains `Calendar`, a `Machine.define` + `Part.define` Calendar Part (`Idle` | `Focused`) composing `DateGrid` and `RovingFocus`, synced by default (`Domain` category, `Pace.Synced`) with `Calendar.make` and `Calendar.deviceOnly()`. It covers single-date and date-range selection modes, focused date and roving tabindex, `Day` / `Month` / `Year` view switching, previous/next month and year stepping, today jump, disabled/min/max constraints, `atRest`, element IDs, and reference-stable `SlotBinding` projections (`Grid`, `GridCell`, `PreviousMonthButton`, `NextMonthButton`, `Heading`).
- `foldkit/behavior` `Slot` gains generic `'Grid'` (`grid`) and `'GridCell'` (`gridcell`) roles.
- `foldkit/test` gains `CalendarFixture` proving the core `Calendar` Part across HTML, React, and React Native generic hosts with zero Calendar-specific painter logic.
- `@foldkit/ui`'s `Calendar` keeps every public export and signature intact while delegating month-grid generation, weekday rotation, constraints, 2D keyboard navigation, focus reconciliation, and element IDs to `foldkit/behavior` with zero painter ratchet rises.
