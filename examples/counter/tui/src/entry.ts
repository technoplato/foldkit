#!/usr/bin/env node
import {
  memorySyncedEngine,
  startSyncedCounterHandle,
} from 'counter-core-example'
import { Effect } from 'effect'
import { Processor } from 'foldkit'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runCounterTui } from './client.js'
import { startInstantCounter } from './instantHost.js'

const handle =
  process.env['COUNTER_TAPE'] === 'memory'
    ? startSyncedCounterHandle(memorySyncedEngine(Processor.Host.Tui()))
    : startInstantCounter()

runCounterTui(handle).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
