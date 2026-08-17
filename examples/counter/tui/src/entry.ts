#!/usr/bin/env node
import { startMemoryCounterWindow } from 'counter-core-example'
import { Effect } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runCounterTui } from './client.js'
import { startInstantCounterWindow } from './instantHost.js'

const runtime =
  process.env['COUNTER_TAPE'] === 'memory'
    ? startMemoryCounterWindow()
    : startInstantCounterWindow()

runCounterTui(runtime).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
