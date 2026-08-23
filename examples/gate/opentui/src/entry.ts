#!/usr/bin/env bun
import { Effect } from 'effect'
import { GateOriginHttpLive, GateOriginTest } from 'gate-core-example'

import { NodeRuntime } from '@effect/platform-node'
import { createCliRenderer } from '@opentui/core'

import { runGateOpenTui } from './client.js'

const originLayer =
  process.env['GATE_ORIGIN'] === 'test' ? GateOriginTest : GateOriginHttpLive

const start = Effect.gen(function* () {
  const renderer = yield* Effect.promise(() =>
    createCliRenderer({ exitOnCtrlC: true }),
  )
  yield* runGateOpenTui(originLayer, renderer)
  renderer.destroy()
})

start.pipe(NodeRuntime.runMain)
