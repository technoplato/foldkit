#!/usr/bin/env node
import { Array, Effect, pipe } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runWalletTerminal } from './host.js'

const maybeCarrier = pipe(
  Array.drop(process.argv, 2),
  Array.dropWhile(argument => argument === '--'),
  Array.head,
)

runWalletTerminal(maybeCarrier).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
