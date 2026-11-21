---
'foldkit': minor
'@foldkit/ui': patch
'@foldkit/react-native': patch
---

Add Widget #13 of 54: core `Textarea` Part in `foldkit/behavior` reusing `FieldDraft` (`Pace.Settled` typing-pause sync), keeping `@foldkit/ui`'s `Textarea` working as a thin painter over those core rules.

- `foldkit/behavior` gains `Textarea` (a `Machine.define` + `Part.define` Part composing `FieldDraft`, synced by default under `Domain` using `Pace.Settled({ afterMs: 200 })` on `ChangeTextarea` and `Pace.Synced()` on discrete actions, with `Textarea.make` and `Textarea.deviceOnly()`, covering multiline text drafts, `lineCountOf`, clamped auto-grow `visibleRowsOf`, `characterCountOf` / `remainingCharactersOf` with `maxLength`, `resolveTextareaKey` keeping plain `Enter` as newline while submitting on `Mod+Enter` / `Ctrl+Enter` and cancelling on `Escape`, disabled/readOnly/required/invalid guards, element IDs, and reference-stable `SlotBinding` projections for `Textarea`, `Label`, `Description`, `Error`, and `ClearButton`).
- `foldkit/behavior` `Slot` adds generic `isMultiline?: boolean` mapping to `'aria-multiline': 'true'` when `true`, and `@foldkit/react-native`'s generic `textInputPropsOf` passes through `multiline: true` when `binding.isMultiline === true` with zero Textarea-specific painter logic.
- `foldkit/test` gains `TextareaFixture` proving the core Textarea Part across HTML, React, and React Native generic hosts.
- `@foldkit/ui`'s `Textarea` delegates `descriptionId`, `isDisabledOf`, `isInvalidOf`, and `canInput` to `foldkit/behavior` (`Textarea`) while keeping every public export and signature intact, consolidates its `foldkit/html` imports from 3 to 1, and adds `scene.test.ts`.
