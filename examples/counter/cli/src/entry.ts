#!/usr/bin/env node
import { Effect } from 'effect'
import { Command, Flag } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runCliOperation } from './host.js'

const verboseFlag = Flag.boolean('verbose').pipe(
  Flag.withDescription('Print the Model and Message progress to stdout'),
)

const show = Command.make('show', { isVerbose: verboseFlag }, ({ isVerbose }) =>
  runCliOperation('Show', isVerbose),
).pipe(Command.withDescription('Print the initial count'))

const increment = Command.make(
  'increment',
  { isVerbose: verboseFlag },
  ({ isVerbose }) => runCliOperation('Increment', isVerbose),
).pipe(Command.withDescription('Increment and print the resulting count'))

const decrement = Command.make(
  'decrement',
  { isVerbose: verboseFlag },
  ({ isVerbose }) => runCliOperation('Decrement', isVerbose),
).pipe(Command.withDescription('Decrement and print the resulting count'))

const reset = Command.make(
  'reset',
  { isVerbose: verboseFlag },
  ({ isVerbose }) => runCliOperation('Reset', isVerbose),
).pipe(Command.withDescription('Reset and print the resulting count'))

const counter = Command.make('foldkit-counter').pipe(
  Command.withSubcommands([show, increment, decrement, reset]),
)

Command.run(counter, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
