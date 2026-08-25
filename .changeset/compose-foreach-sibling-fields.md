---
'foldkit': minor
---

Compose sibling Model fields beside `Program.compose.forEach` rows.
Pass `fields` (Schemas flattened beside `nextId` / `rows`), `initialFields`,
and optional `messages` plus `updateFields`. Field-owner Messages join the
composed union unwrapped, mirroring `Program.compose.actionMenu`, so list
apps stop hand-rolling Got* arms for app-owned state. Reserved keys
`nextId` / `rows` in `fields` throw `ForEachReservedFieldError`.
