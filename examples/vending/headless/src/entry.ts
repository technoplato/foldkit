#!/usr/bin/env node
import { Array, Effect, Option } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runHeadless } from './host.js'
import { optionsFromEnvironment, runTill } from './tillServer.js'

const maybeMode = Array.get(process.argv, 2)
const program =
  Option.isSome(maybeMode) && maybeMode.value === 'till'
    ? runTill(optionsFromEnvironment())
    : runHeadless()

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
