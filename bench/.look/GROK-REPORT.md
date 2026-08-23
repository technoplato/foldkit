# GROK-REPORT | foldkit/bench v1 + live Counter rung A

Harness plus the first Counter submission. Proof is https://counter.knophy.com. Counter product files were not edited. Leftover 240, 242, and 243 remain open and were not closed.

## Files changed

- `bench/` (new package `foldkit-bench`)
- `pnpm-workspace.yaml` (added `bench`)
- `knip.json` (CLI entry for `bench`)
- `package.json` (thin `pnpm bench` script)

## How to run

`pnpm bench`

## Config shape

`model`, `temperature`, `maxOutputTokens`, `topP`, `topK`, `presencePenalty`, `frequencyPenalty`, `stopSequences`, `seed`, `reasoning`, `maxRetries`, `timeout`, `headers`, `providerOptions`

## Traces path

`bench/traces/` and `bench/.look/last-run.json`

Latest live grade: `bench/traces/2026-08-23T13-42-19.321Z-rung-A.json`

tokens 0/0/0 (no model call). loc 0/0/0 (Counter not edited). wallClockMs 10252.

## Assert names

countVisible pass, incrementRaises pass, decrementLowers pass, instantSettlesLive pass, offlineWorks pass, actionMenuAbstraction fail (overlay not visible after cmd-K or ?), sameScreenMirrored pass, globalSync pass.

actionMenuAbstraction is an honest product fail. Counter was not changed to make it pass.

## Leftover

Leftover 240, 242, and 243 remain open and were not closed.
