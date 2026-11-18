---
'@foldkit/oxlint-plugin': minor
---

`foldkit/no-raw-page-check` reports `typeof window` and `typeof document` and points to `Environment.maybePage()`. Only `environment/environment.ts` may check those globals.
