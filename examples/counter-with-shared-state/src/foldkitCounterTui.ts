#!/usr/bin/env node
import { Effect, Option } from 'effect'
import { Command, Flag } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runCounterTui, runLoadingCounterTui } from './tuiHost.js'

const uri = Flag.string('uri').pipe(
  Flag.withDescription('Portable Counter state to open'),
  Flag.optional,
)

const counterTui = Command.make('foldkit-counter-tui', { uri }, ({ uri }) =>
  Option.match(uri, {
    onNone: runLoadingCounterTui,
    onSome: runCounterTui,
  }),
)

Command.run(counterTui, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
