---
'foldkit': minor
'@foldkit/devtools-mcp': minor
---

Take Mount args as data in `Mount.define`.

`Mount.define` is now a curried call. The first call binds the name and result Message schemas (and optionally an args Schema record); the second binds the factory, or a factory builder when args are declared. The returned Definition is callable to produce a `MountAction`: pass the declared args, or call with no args for argless Mounts.

Each Mount instance carries its args as a field, and the runtime surfaces that field through:

- **The DevTools Mounts tab**: each Mount renders as a tag at the top of its row with the declared args as a data tree below (chevrons for nested fields). Argless Mounts show only the name.
- **The MCP wire protocol** consumed by `@foldkit/devtools-mcp`: `SerializedEntry.mountStartNames` / `mountEndNames` and `ResponseInit.mountStartNames` are replaced by `mountStarts` / `mountEnds: Array<{ name: string; args: Option<Record<string, unknown>> }>`.
- **`Scene.Mount` matchers** (`expectHas`, `expectExact`, `expectEnded`, `resolve`, `resolveAll`): each now accepts either a Mount Definition (matches by name; existing lax behavior) or a Mount instance (matches by name AND structural-equal args; new strict behavior). Pass a Definition when the test only cares that some Mount with this identity is rendered; pass an instance when the test should verify the args the runtime captured.

```ts
// Lax: matches any AnchorPopover, regardless of args
Scene.Mount.expectHas(AnchorPopover)

// Strict: only matches AnchorPopover({ buttonId: 'cart-button', anchor })
Scene.Mount.expectHas(AnchorPopover({ buttonId: 'cart-button', anchor }))
```

Failure messages now show the args the runtime captured alongside the args expected, so a wrong-args mismatch reads `AnchorPopover {"buttonId":"settings-button","anchor":{...}}` vs `AnchorPopover {"buttonId":"cart-button","anchor":{...}}` rather than just `AnchorPopover`.

## Migration

### Argless Mounts

```ts
// Before
const FocusInput = Mount.define('FocusInput', CompletedFocusInput)
const focusInput = FocusInput(element =>
  Effect.sync(() => {
    if (element instanceof HTMLInputElement) element.focus()
    return { message: CompletedFocusInput(), cleanup: Function.constVoid }
  }),
)

// At the call site:
OnMount(focusInput)
```

```ts
// After
const FocusInput = Mount.define(
  'FocusInput',
  CompletedFocusInput,
)(element =>
  Effect.sync(() => {
    if (element instanceof HTMLInputElement) element.focus()
    return { message: CompletedFocusInput(), cleanup: Function.constVoid }
  }),
)

// At the call site:
OnMount(FocusInput())
```

The camelCase factory (`focusInput`) goes away. The PascalCase Definition (`FocusInput`) is now the thing you call directly with `()`.

### Mounts that previously closed over values

If your old Mount captured values via closure:

```ts
// Before
const AnchorPopover = Mount.define('AnchorPopover', CompletedAnchorPopover)
const anchorPopover = (buttonId: string, anchor: AnchorConfig) =>
  AnchorPopover(element =>
    Effect.sync(() => {
      const cleanup = anchorSetup({ buttonId, anchor })(element)
      return { message: CompletedAnchorPopover(), cleanup }
    }),
  )

// At the call site:
OnMount(anchorPopover(buttonId, anchor))
```

declare those values as Schema-typed args:

```ts
// After
const AnchorPopover = Mount.define(
  'AnchorPopover',
  { buttonId: S.String, anchor: AnchorConfig },
  CompletedAnchorPopover,
)(
  ({ buttonId, anchor }) =>
    element =>
      Effect.sync(() => {
        const cleanup = anchorSetup({ buttonId, anchor })(element)
        return { message: CompletedAnchorPopover(), cleanup }
      }),
)

// At the call site:
OnMount(AnchorPopover({ buttonId, anchor }))
```

Only values that vary per render should become args. Module-level constants stay in lexical scope. The factory is two-stage when args are declared: the first stage receives the args record, the second receives the live `Element` handle.

### Submodel patterns

`Mount.mapMessage` still preserves both name and args through wrapping, so threading a child module's Mount up to the parent Message continues to work unchanged at sites like:

```ts
OnMount(Mount.mapMessage(FocusUsernameInput(), toParentMessage))
```

### `@foldkit/devtools-mcp` consumers

The wire shape changed:

```diff
- SerializedEntry.mountStartNames: Array<string>
- SerializedEntry.mountEndNames: Array<string>
+ SerializedEntry.mountStarts: Array<{ name: string; args: Option<Record<string, unknown>> }>
+ SerializedEntry.mountEnds: Array<{ name: string; args: Option<Record<string, unknown>> }>
- ResponseInit.mountStartNames: Array<string>
+ ResponseInit.mountStarts: Array<{ name: string; args: Option<Record<string, unknown>> }>
```

Reading the previous string: pull `mount.name`. Reading the new args data: read `mount.args` as `Option<Record<string, unknown>>` (`None` for argless Mounts, `Some(record)` when args were declared).

### Tests

Existing `Scene.Mount` calls keep working, since passing a Definition still matches by name (lax). To strengthen a test, pass a Mount instance instead of the Definition:

```ts
// Lax (old, still works)
Scene.Mount.expectHas(AnchorPopover)

// Strict (new, locks in the args)
Scene.Mount.expectHas(AnchorPopover({ buttonId: 'cart-button', anchor }))
```

Use the strict form when the args carry meaning for the test's claim.
