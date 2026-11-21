---
'foldkit': minor
'@foldkit/ui': patch
'@foldkit/react': patch
'@foldkit/react-native': patch
---

Add Widget #12 of 54: reusable `FieldDraft` block (`Pace.Settled` typing-pause sync) and core `Input` Part in `foldkit/behavior`, keeping `@foldkit/ui`'s `Input` working as a thin painter over those core rules.

- `foldkit/behavior` gains `FieldDraft` (a reusable `Machine.define` block with discriminated union state `Idle | Editing`, syncing `ChangeDraft` on typing pauses via `Pace.Settled({ afterMs: 200 })` without waiting for blur, with `BeginEdit`, `ChangeDraft`, `CommitDraft`, `CancelDraft`, `ClearDraft`, `SetFieldValue`, `EndEdit`, `ResetField`, `maxLength` / `trimOnCommit` normalization, `blurBehavior` / `commitOnBlur`, disabled/readOnly guards, remote value reconciliation, and pure readings).
- `foldkit/behavior` gains `Input` (a `Machine.define` + `Part.define` Part composing `FieldDraft`, synced by default under `Domain` using `Pace.Settled({ afterMs })` on `ChangeInput` and `Pace.Synced()` on discrete actions, with `Input.make`, `Input.secret()` (`Device({ because: 'Secret' })`), and `Input.deviceOnly()`, covering text/email/password/search/tel/url/number types, password visibility toggle and `effectiveInputTypeOf`, inline editable view/edit/commit/cancel mode with `resolveEditableKey`, element IDs, and reference-stable `SlotBinding` projections for `Input`, `Label`, `Description`, `Error`, `VisibilityToggle`, `ClearButton`, and `Preview`).
- `foldkit/behavior` `Slot` adds generic `TextBox` (`'textbox'`) role, `TextInputNode` gains optional generic `slot?: SlotBinding`, and the HTML, React, and React Native generic hosts apply generic `TextInput` slot bindings with zero widget-specific painter logic.
- `foldkit/test` gains `InputFixture` proving the core Input Part across HTML, React, and React Native generic hosts.
- `@foldkit/ui`'s `Input` delegates `descriptionId`, default input type, and disabled/interactive `onInput` guard to `foldkit/behavior` (`Input`) while keeping every public export and signature intact, consolidates its `foldkit/html` imports from 3 to 1, and adds `scene.test.ts`.
