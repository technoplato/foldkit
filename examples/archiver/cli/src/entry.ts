#!/usr/bin/env node
import { Effect } from 'effect'
import { Argument, Command, Flag } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import {
  runArchiverArchive,
  runArchiverInput,
  runArchiverList,
  runArchiverOpen,
} from './host.js'

const verboseFlag = Flag.boolean('verbose').pipe(
  Flag.withDescription('Print the Model and Message progress to stdout'),
)

const urlArgument = Argument.string('url')
const idArgument = Argument.string('id')
const tokensArgument = Argument.string('token').pipe(
  Argument.variadic({ min: 1 }),
)

const list = Command.make('list', { isVerbose: verboseFlag }, ({ isVerbose }) =>
  runArchiverList(isVerbose),
).pipe(Command.withDescription('Print the recorded archives'))

const archive = Command.make(
  'archive',
  { url: urlArgument, isVerbose: verboseFlag },
  ({ url, isVerbose }) => runArchiverArchive(url, isVerbose),
).pipe(Command.withDescription('Paste a URL and submit it for ingest'))

const open = Command.make(
  'open',
  { id: idArgument, isVerbose: verboseFlag },
  ({ id, isVerbose }) => runArchiverOpen(id, isVerbose),
).pipe(Command.withDescription('Click and open one archive by id'))

const doCommand = Command.make(
  'do',
  { tokens: tokensArgument, isVerbose: verboseFlag },
  ({ tokens, isVerbose }) => runArchiverInput(tokens, isVerbose),
).pipe(Command.withDescription('Apply tokens: url:<url> submit open:<id>'))

const archiver = Command.make('foldkit-archiver').pipe(
  Command.withSubcommands([list, archive, open, doCommand]),
)

Command.run(archiver, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
