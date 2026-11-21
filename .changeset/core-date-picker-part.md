---
'foldkit': minor
'@foldkit/ui': patch
---

Add Widget #20 of 54: core `DatePicker` Part in `foldkit/behavior` (composing `Calendar`, `DateGrid`, `Placement`, and `Layers`), while keeping `@foldkit/ui`'s `DatePicker` working as a thin painter over those core rules.

- `foldkit/behavior` gains `DatePicker`, a `Machine.define` + `Part.define` DatePicker Part (`Closed` | `Open`) composing `Calendar`, `DateGrid`, `Placement`, and `Layers`, synced by default (`Domain` category, `Pace.Synced`) with `DatePicker.make` and `DatePicker.deviceOnly()`. It covers single-date and date-range picking, trigger open/close (`OpenDatePicker`, `CloseDatePicker`, `ToggleDatePicker`, `DismissDatePicker`), `Escape` and outside-pointer dismiss via `Layers`, `closeOnSelect` and `closeOnClear` rules, embedded `Calendar` navigation (month/year/decade stepping, 2D keyboard navigation, min/max/disabled constraints), pure date-input parsing and formatting (`Iso`, `MonthDayYear`, `DayMonthYear`, and ranges without `new Date()`), `Placement.placeFor` popup geometry, disabled/readOnly/required/invalid guards, `atRest`, element IDs, and reference-stable `SlotBinding` projections (`Trigger`, `Input`, `Content`, delegated `Grid`/`GridCell`/`PreviousMonthButton`/`NextMonthButton`/`Heading`, `ClearButton`, `Label`, `Description`, `Error`, `Backdrop`).
- `foldkit/test` gains `DatePickerFixture` proving the core `DatePicker` Part across HTML, React, and React Native generic hosts with zero DatePicker-specific painter logic.
- `@foldkit/ui`'s `DatePicker` keeps every public export and signature intact while delegating element IDs, selection/clear close rules, trigger label precedence, and ISO hidden-input formatting to `foldkit/behavior` with zero painter ratchet rises.
