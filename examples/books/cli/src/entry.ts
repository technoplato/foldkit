#!/usr/bin/env node
import { Effect } from 'effect'
import { Argument, Command, Flag } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runBooksInput, runBooksShow } from './host.js'

const verboseFlag = Flag.boolean('verbose').pipe(
  Flag.withDescription('Print Message progress to stdout'),
)

const tokensArgument = Argument.string('token').pipe(
  Argument.variadic({ min: 1 }),
)

const show = Command.make('show', { isVerbose: verboseFlag }, ({ isVerbose }) =>
  runBooksShow(isVerbose),
).pipe(Command.withDescription('Print the signed-out or current screen'))

const doCommand = Command.make(
  'do',
  { tokens: tokensArgument, isVerbose: verboseFlag },
  ({ tokens, isVerbose }) => runBooksInput(tokens, isVerbose),
).pipe(
  Command.withDescription(
    'Apply tokens: signin signout back import scan scanned settings accounts search text audio both pause resume stop reader open:<id> play:<id> query:<text>',
  ),
)

const books = Command.make('foldkit-books').pipe(
  Command.withSubcommands([show, doCommand]),
)

Command.run(books, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
