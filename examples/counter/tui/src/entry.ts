#!/usr/bin/env node
import { startLiveCounter } from 'counter-core-example'
import { Effect } from 'effect'
import { Processor } from 'foldkit'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runCounterTui } from './client.js'

const handle = startLiveCounter(Processor.Host.Tui())

const window = process.argv.includes('--window=screen') ? 'Screen' : 'Bespoke'

runCounterTui(handle, window).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
