---
'foldkit': minor
---

Add the core `BoundField` primitive in `foldkit/behavior`, the zero-React JSX-to-`UiNode` runtime (`foldkit/jsx-runtime` and `foldkit/jsx-dev-runtime`), and static non-interactive CLI `Slot` painting (`paintCli`, `renderCli`, `renderPlainCli`) in `foldkit/renderers`.

- `foldkit/behavior` gains `BoundField`, binding a typed `ModelPath<string>`, an Effect Schema, `FieldDraft` (`Pace.Settled` typing-pause sync), and `Fieldset` (group disabled, server error merging, form validation, `firstInvalidFieldOf`) into zero-manual-props `UiNode` and `SlotBinding` projections (`toTextInput`, `toTextarea`, `toSlots`, `toField`, `toForm`, `toPart`), pure `readAt`/`writeAt` immutable path lenses, and Schema-derived IDs, labels, descriptions, constraints, and human validation errors.
- `foldkit/declaration` `ModelPath<A>` now carries a covariant optional value phantom so `ModelPath<string>` is checked strictly against non-string paths while remaining assignable to `ModelPath<unknown>`.
- `foldkit/renderers` gains `Jsx` and exports `foldkit/jsx-runtime` and `foldkit/jsx-dev-runtime` (`jsx`, `jsxs`, `jsxDEV`, `Fragment`), compiling JSX directly into plain Foldkit `UiNode` trees (`Column`, `Row`, `Box`, `Text`, `Heading`, `Button`, `TextInput`, `List`, `Spacer`, `Dock`, `Badge`, `Separator`, and more) with zero React runtime.
- `foldkit/renderers` gains `paintCli`, `renderCli`, `renderPlainCli`, and `stripAnsi`, extending `layout.ts` and `paint.ts` to render generic `Slot` roles (`Switch`, `Checkbox`, `Radio`, `Tab`, `Button`, `TextBox`, `Status`, `Alert`, `Dialog`, `AlertDialog`, `Listbox`, `Option`, `Menu`, `MenuItem`, `Group`, `Tooltip`) to deterministic ANSI-styled or plain terminal output without naming any widget module.
