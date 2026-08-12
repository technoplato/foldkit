#!/usr/bin/env node
import { Effect } from 'effect'
import { Argument, Command, Flag } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runConversationsInput, runConversationsShow } from './host.js'

const verboseFlag = Flag.boolean('verbose').pipe(
  Flag.withDescription('Print Message progress to stdout'),
)

const tokensArgument = Argument.string('token').pipe(
  Argument.variadic({ min: 1 }),
)

const show = Command.make('show', { isVerbose: verboseFlag }, ({ isVerbose }) =>
  runConversationsShow(isVerbose),
).pipe(Command.withDescription('Print the projects list'))

const doCommand = Command.make(
  'do',
  { tokens: tokensArgument, isVerbose: verboseFlag },
  ({ tokens, isVerbose }) => runConversationsInput(tokens, isVerbose),
).pipe(
  Command.withDescription(
    'Apply tokens: projects chats settings back ingest stop project:<id> open:<id> follow:<id> delete:<id>',
  ),
)

const conversations = Command.make('foldkit-conversations').pipe(
  Command.withSubcommands([show, doCommand]),
)

Command.run(conversations, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
