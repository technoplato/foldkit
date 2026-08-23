# Foldkit bench

Software-engineering benchmark harness. One command, many JSON configs. v1 grades live Counter on the public proof host.

Proof host: `https://counter.knophy.com`. The painted page is the pass. Not GitHub. Not localhost.

## How to run

```sh
pnpm bench
```

Optional config:

```sh
pnpm bench -- --config bench/configs/xai.grok-4.6.json
```

## Config shape

Vercel AI SDK request-config fields. `model` is `provider/model-id`. Files are JSON under `bench/configs/`.

- `model`
- `temperature`
- `maxOutputTokens`
- `topP`
- `topK`
- `presencePenalty`
- `frequencyPenalty`
- `stopSequences`
- `seed`
- `reasoning` (`provider-default` | `none` | `minimal` | `low` | `medium` | `high` | `xhigh`)
- `maxRetries`
- `timeout` (number ms, or `{ totalMs, stepMs }`)
- `headers`
- `providerOptions`

## Traces

Each run writes JSON under `bench/traces/`. A copy is also written to `bench/.look/last-run.json`.

Recorded:

- `tokens.input` / `tokens.output` / `tokens.total` (zero is honest when no model ran)
- `wallClockMs`
- `loc.added` / `loc.removed` / `loc.changed`
- assert outcomes
- the request config

v1 grades the live page and does not call a model, so tokens are `0 / 0 / 0`. This round does not edit Counter, so loc is `0 / 0 / 0`.

## Counter assert names

Maestro-flavored YAML in `rungs/a.build-a-counter.yaml`.

- `countVisible`
- `incrementRaises`
- `decrementLowers`
- `instantSettlesLive`
- `offlineWorks`
- `actionMenuAbstraction`
- `sameScreenMirrored`
- `globalSync`

`instantSettlesLive` grades a live Instant snapshot against fail-closed Memory after 8s. An honest fail is recorded if Instant never returned a snapshot.

`sameScreenMirrored` checks `https://counter-mobile.knophy.com`. Proof remains `https://counter.knophy.com`.

`globalSync` grades shared Instant count, not login.

Reset is hidden at count 0. The harness does not require a visible Reset button.

## Rungs

Rung A (Build a counter) is the live v1 submission.

Later tweet rungs are stub names only in `rungs/catalog.yaml`. They are not graded and are not implemented as product work.

## Workspace package

Private package `foldkit-bench`. Type module. Effect plus Schema.
