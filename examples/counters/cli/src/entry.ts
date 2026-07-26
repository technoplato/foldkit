#!/usr/bin/env node
import { Effect } from 'effect'
import { Argument, Command, Flag } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runCounters } from './host.js'

const verboseFlag = Flag.boolean('verbose').pipe(
  Flag.withDescription('Print commands valid in the final state and mode'),
)

const actionsArgument = Argument.string('action').pipe(
  Argument.variadic({ min: 1 }),
)

const show = Command.make('show', { isVerbose: verboseFlag }, ({ isVerbose }) =>
  runCounters([], isVerbose),
).pipe(Command.withDescription('Print the initial Multiple Counters screen'))

const run = Command.make(
  'run',
  { actions: actionsArgument, isVerbose: verboseFlag },
  ({ actions, isVerbose }) => runCounters(actions, isVerbose),
).pipe(
  Command.withDescription(
    'Run valid state-dependent actions and print the final screen',
  ),
)

const counters = Command.make('foldkit-counters').pipe(
  Command.withSubcommands([show, run]),
)

Command.run(counters, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
