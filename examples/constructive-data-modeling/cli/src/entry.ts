#!/usr/bin/env node
import { Effect } from 'effect'
import { Argument, Command, Flag } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { type CliOperation, runCliOperation, runCliPage } from './host.js'

const verboseFlag = Flag.boolean('verbose').pipe(
  Flag.withDescription('Print the complete immutable Model'),
)

const operation = (name: string, value: CliOperation, description: string) =>
  Command.make(name, { isVerbose: verboseFlag }, ({ isVerbose }) =>
    runCliOperation(value, isVerbose),
  ).pipe(Command.withDescription(description))

const page = Command.make(
  'page',
  { isVerbose: verboseFlag, page: Argument.integer('page') },
  ({ isVerbose, page }) => runCliPage(page, isVerbose),
).pipe(Command.withDescription('Jump to one exact authored page from 1 to 158'))

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
    page,
  ]),
)

Command.run(deck, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
