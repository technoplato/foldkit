---
'foldkit': minor
'@foldkit/devtools': patch
'@foldkit/devtools-mcp': minor
'@foldkit/oxlint-plugin': patch
'@foldkit/vite-plugin': patch
---

Add a renderer-free Program engine for running typed Foldkit Models, Messages, Commands, and Subscriptions through one scoped Effect Resources Layer. The engine provides causal operation completion, Model observation, and a universal typed journal and replay capability on every Program runtime. Journal retention is configurable, with retain-all and settled-boundary bounded in-memory archives. Portable replay tapes, inert historical inspection, and live branching derive from the Program and journal without domain registration.

Add engine-owned state and replay URI parser-printers. Programs derive one canonical relative path and query format from their id and Schemas, and registered Program sets compose those routes into typed destination unions through case paths.

Add an injected replay tape store and canonical UUID-backed replay routes for short, durable links. Saved routes load and decode the typed tape through the selected Program, validate the requested frame, and remain portable across rendered, CLI, and terminal clients.

Make `makeApplication`, `makeElement`, and the explicit Foldkit rendering adapter delegate application execution to the Program engine while retaining renderer-specific Mount, HMR, visibility, freeze, slow-phase, duplicate-id, crash, and document behavior. The deprecated host runtime remains a compatibility facade.

Move ManagedResource lifecycle and Port channels into the Program engine. Add typed Navigation provenance, transport-neutral Subscription and ManagedResource lifecycle diagnostics, and terminal failure observation for fire-and-forget clients.

Present the authoritative Program journal directly through DevTools, removing the second bounded reconstruction store. Add a DevTools protocol and MCP tool for runtime lifecycle diagnostics and terminal failure provenance.

Migration: pass the application's `Message` Schema to `makeApplication`, `makeElement`, and `makeHostRuntime`. Replace `DevToolsConfig.keyframeInterval` with the Program runtime's journal retention configuration.
