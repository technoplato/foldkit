#!/usr/bin/env node
import { Effect } from 'effect'
import { Command, Flag } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { type CliOperation, runCliOperation } from './host.js'

const verboseFlag = Flag.boolean('verbose').pipe(
  Flag.withDescription('Print the complete immutable Model'),
)

const operation = (name: string, value: CliOperation, description: string) =>
  Command.make(name, { isVerbose: verboseFlag }, ({ isVerbose }) =>
    runCliOperation(value, isVerbose),
  ).pipe(Command.withDescription(description))

const deck = Command.make('foldkit-constructive-data-modeling').pipe(
  Command.withSubcommands([
    operation('show', 'Show', 'Show the opening slide'),
    operation('next', 'Next', 'Advance once from the opening slide'),
    operation(
      'positive-space',
      'PositiveSpace',
      'Show the positive-space construction cue',
    ),
    operation(
      'obligations',
      'Obligations',
      'Show the obligation-propagation cue',
    ),
    operation('recap', 'Recap', 'Show the authored recap cue'),
    operation('thanks', 'Thanks', 'Show the authored closing cue'),
  ]),
)

Command.run(deck, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
