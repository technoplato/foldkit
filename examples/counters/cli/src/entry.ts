#!/usr/bin/env node
import { pathToNavigation } from 'counters-core-example'
import { Effect, Option } from 'effect'
import { Argument, Command, Flag } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runCounters } from './host.js'

const verboseFlag = Flag.boolean('verbose').pipe(
  Flag.withDescription('Print commands valid in the final state and mode'),
)

const uriFlag = Flag.string('uri').pipe(
  Flag.withDescription('Portable Multiple Counters state to open'),
  Flag.optional,
)

const actionsArgument = Argument.string('action').pipe(
  Argument.variadic({ min: 1 }),
)

const show = Command.make(
  'show',
  { isVerbose: verboseFlag, uri: uriFlag },
  ({ isVerbose, uri }) =>
    runCounters([], isVerbose, Option.map(uri, pathToNavigation)),
).pipe(Command.withDescription('Print one Multiple Counters screen'))

const run = Command.make(
  'run',
  { actions: actionsArgument, isVerbose: verboseFlag, uri: uriFlag },
  ({ actions, isVerbose, uri }) =>
    runCounters(actions, isVerbose, Option.map(uri, pathToNavigation)),
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
