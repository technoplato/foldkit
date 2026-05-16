---
'@foldkit/devtools-mcp': patch
---

Fix `foldkit_dispatch_message` arriving at the browser runtime as a JSON string. The tool's `message` input was typed as `S.Unknown`, which generates a JSON Schema entry with no `type` constraint. MCP hosts that consult the input schema (Claude Code, Cursor, etc.) default to stringifying arguments without a `type: "object"` hint, so the entire Message object was relayed through the bridge as a JSON-encoded string and rejected at the runtime decode step. Typing the field as `S.Record(S.String, S.Unknown)` keeps the runtime decode authoritative while emitting `type: "object"` for MCP clients.
