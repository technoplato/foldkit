#!/usr/bin/env node
import { Effect } from 'effect'
import { GateOriginHttpLive, GateOriginTest } from 'gate-core-example'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runGateTui } from './host.js'

const originLayer =
  process.env['GATE_ORIGIN'] === 'test' ? GateOriginTest : GateOriginHttpLive

runGateTui(originLayer).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
