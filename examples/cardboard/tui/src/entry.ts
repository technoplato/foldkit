#!/usr/bin/env node
import { Array, Effect, Option, pipe } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { parseCardboardTuiRoute, runCardboardTui } from './host.js'

const maybeCarrier = pipe(
  Array.drop(process.argv, 2),
  Array.dropWhile(argument => argument === '--'),
  Array.head,
)
const program = Option.match(maybeCarrier, {
  onNone: runCardboardTui,
  onSome: carrier =>
    parseCardboardTuiRoute(carrier).pipe(Effect.flatMap(runCardboardTui)),
})

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
