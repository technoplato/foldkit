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

const cardboard = Command.make('foldkit-cardboard').pipe(
  Command.withSubcommands([
    operation('show', 'Show', 'Show four at /0'),
    operation('next', 'Next', 'Advance from /0 to /0/5'),
    operation('tap', 'Tap', 'Press and release the black control'),
    operation('hold', 'Hold', 'Hold the control until configuration opens'),
    operation('skip', 'Skip', 'Skip the current onboarding step'),
    operation('finish', 'Finish', 'Complete Rule Zero'),
    operation(
      'try-controller',
      'TryController',
      'Try a Genesis-style controller in the first riddle',
    ),
    operation('mirror', 'Mirror', 'Answer the first riddle with Mirror'),
    operation('log', 'Log', 'Show the append-only /0/log decision log'),
    operation('reset', 'Reset', 'Return to /0'),
  ]),
)

Command.run(cardboard, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
