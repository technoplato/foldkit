#!/usr/bin/env node
import { Array, Effect, Option, pipe } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runCountersTerminal } from './host.js'

const maybeCarrier = pipe(
  Array.drop(process.argv, 2),
  Array.dropWhile(argument => argument === '--'),
  Array.head,
)
const carrier = Option.getOrElse(maybeCarrier, () => '/counters')

runCountersTerminal(carrier).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
