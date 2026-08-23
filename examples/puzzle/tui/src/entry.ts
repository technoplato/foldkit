#!/usr/bin/env node
import { Effect } from 'effect'
import { Processor } from 'foldkit'
import { startLivePuzzle } from 'puzzle-core-example'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runPuzzleTui } from './client.js'

const handle = startLivePuzzle(Processor.Host.Tui())

const window = process.argv.includes('--window=screen') ? 'Screen' : 'Bespoke'

runPuzzleTui(handle, window).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
