---
'foldkit': minor
'@foldkit/ui': patch
---

Add Widget #14 of 54: core `Fieldset` Part in `foldkit/behavior` covering `@foldkit/ui` `Fieldset` and Radix `form` semantics, while keeping `@foldkit/ui`'s `Fieldset` working as a thin painter over those core rules.

- `foldkit/behavior` gains `Fieldset`, a framework-free `Machine.define` + `Part.define` Part (`Idle` | `Submitting` | `Submitted` | `Failed`) synced by default under `Domain` with `Pace.Synced`, plus `Fieldset.make` and `Fieldset.deviceOnly()`. It covers group disabled state (`isDisabled`, `SetDisabled`, `isFieldDisabled`), element IDs (`fieldsetId`, `legendId`, `descriptionId`, `errorId`, `fieldMessageId`, `submitButtonId`, `resetButtonId`), Radix `form` per-field client/custom and server validation errors (`SetFieldError`, `ClearFieldError`, `SetServerErrors`, `ClearServerErrors`), submission attempt and reset lifecycle (`AttemptSubmit`, `SucceededSubmit`, `FailedSubmit`, `ResetFieldset`), pure readings (`isValidOf`, `isFieldInvalidOf`, `errorsOf`, `fieldErrorOf`, `firstInvalidFieldOf`, `submissionStateOf`, `hasAttemptedSubmit`), `atRest`, and reference-stable `SlotBinding` projections (`Fieldset`, `Legend`, `Description`, `SubmitButton`, `ResetButton`, `FieldError`).
- `foldkit/behavior` `Slot` gains generic `'Group'` (`group`) in `Role` and `roleNames`.
- `foldkit/test` gains `FieldsetFixture` proving the core `Fieldset` Part across HTML, React, and React Native generic hosts with zero Fieldset-specific painter logic.
- `@foldkit/ui`'s `Fieldset` keeps every public export and signature intact while delegating `legendId`, `descriptionId`, and disabled rules to `foldkit/behavior`, consolidating `foldkit/html` imports to lower `@foldkit/ui` ratchet counts.
