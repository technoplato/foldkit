---
'foldkit': minor
'@foldkit/devtools-mcp': minor
---

Add `foldkit_get_message_schema`, a new DevTools MCP tool that lets agents discover the exact shape of every Message variant the runtime accepts without reading the application source.

The tool exposes the runtime's Message Schema as a JSON Schema document derived from `DevToolsConfig.Message` via `Schema.toJsonSchemaDocument`. Two call modes keep responses small even for production-scale Message unions:

- **No argument** returns a flat variant index. Each entry carries the variant's `_tag`, its payload field names, and which payload fields are themselves tagged-union shapes the agent will need to pick a variant for.
- **`variant_tag` as a dot-separated path** (e.g. `"GotMobileMenuDialogMessage.GotAnimationMessage"`) walks the path through each variant's single tagged-union payload field and returns the JSON Schema narrowed along the chain. Discriminated unions deeper than the path collapse to `{ "_summary": "union", "variants": [...] }` placeholders so the response stays compact at every depth. Agents extend the path to drill further.

Submodel Messages recurse correctly. `S.Option` fields render as `anyOf` of the `Some` and `None` tag shapes; apps using the JSON-boundary codec `S.OptionFromNullishOr(T)` instead see the field as nullable `anyOf: [T, null]` and should dispatch the bare value or `null` rather than a tagged envelope. The `definitions` block is kept across narrowing so `$ref` targets still resolve, and any discriminated unions it carries (e.g. a shared union annotated with an `identifier`) are collapsed to the same `_summary` placeholder shape. The path walker does not resolve `$ref` indirection itself; agents that need to step through a shared union look it up in `definitions` by name and use the placeholder's variant list. Fields with no JSON representation, like `S.instanceOf(File)`, render as `{ type: 'null' }`; those variants can't be dispatched via MCP because their values live in browser memory. When the app hasn't configured a Message Schema, the response is `maybeResult: None`. The same fallback applies when the schema contains exotic AST nodes that `Schema.toJsonSchemaDocument` rejects at derivation time (symbol-keyed structs, symbol-indexed records, tuples with post-rest elements); the bridge guards the call so a failing schema logs a warning rather than crashing the bridge.

No application changes required.
