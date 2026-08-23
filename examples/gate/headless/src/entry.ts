#!/usr/bin/env node
import { GateOriginHttpLive, GateOriginTest } from 'gate-core-example'

import { NodeRuntime } from '@effect/platform-node'

import { runGateHeadless } from './host.js'

const originLayer =
  process.env['GATE_ORIGIN'] === 'test' ? GateOriginTest : GateOriginHttpLive

runGateHeadless(originLayer).pipe(NodeRuntime.runMain)
