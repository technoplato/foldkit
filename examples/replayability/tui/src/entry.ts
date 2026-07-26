#!/usr/bin/env node
import { Array as Array_, Effect, Option, pipe } from 'effect'
import {
  defaultReplayDestination,
  printReplayDestination,
} from 'replayability-core-example'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runReplayTui } from './host.js'

const maybeUri = pipe(
  Array_.drop(process.argv, 2),
  Array_.dropWhile(argument => argument === '--'),
  Array_.head,
)
const program = Option.match(maybeUri, {
  onNone: () =>
    defaultReplayDestination('Counters').pipe(
      Effect.flatMap(printReplayDestination),
      Effect.flatMap(runReplayTui),
    ),
  onSome: runReplayTui,
})

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
