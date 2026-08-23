#!/usr/bin/env bun
import { Effect } from 'effect'
import {
  SettingsOriginHttpLive,
  SettingsOriginTest,
} from 'settings-core-example'

import { NodeRuntime } from '@effect/platform-node'
import { createCliRenderer } from '@opentui/core'

import { runSettingsOpenTui } from './client.js'

const originLayer =
  process.env['GATE_ORIGIN'] === 'test'
    ? SettingsOriginTest
    : SettingsOriginHttpLive

const start = Effect.gen(function* () {
  const renderer = yield* Effect.promise(() =>
    createCliRenderer({ exitOnCtrlC: true }),
  )
  yield* runSettingsOpenTui(originLayer, renderer)
  renderer.destroy()
})

start.pipe(NodeRuntime.runMain)
