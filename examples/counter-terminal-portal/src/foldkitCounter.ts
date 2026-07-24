#!/usr/bin/env node
import { Effect, Layer } from 'effect'
import { Command, Flag } from 'effect/unstable/cli'
import { fileURLToPath } from 'node:url'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { makeNodeClientLauncherLayer } from './nodeClientLauncher.js'
import { openCounterTui, runStateCommand } from './oneShotHost.js'

const tuiEntryPath = fileURLToPath(
  new URL('./foldkitCounterTui.js', import.meta.url),
)

const verboseFlag = Flag.boolean('verbose').pipe(
  Flag.withDescription('Print the operation story to stdout'),
)

const show = Command.make('show', { isVerbose: verboseFlag }, ({ isVerbose }) =>
  runStateCommand('Show', isVerbose),
).pipe(Command.withDescription('Print the current count'))

const increment = Command.make(
  'increment',
  { isVerbose: verboseFlag },
  ({ isVerbose }) => runStateCommand('Increment', isVerbose),
).pipe(Command.withDescription('Increment and print the new count'))

const decrement = Command.make(
  'decrement',
  { isVerbose: verboseFlag },
  ({ isVerbose }) => runStateCommand('Decrement', isVerbose),
).pipe(Command.withDescription('Decrement and print the new count'))

const reset = Command.make(
  'reset',
  { isVerbose: verboseFlag },
  ({ isVerbose }) => runStateCommand('Reset', isVerbose),
).pipe(Command.withDescription('Reset and print the new count'))

const tui = Command.make('tui', { isVerbose: verboseFlag }, ({ isVerbose }) =>
  openCounterTui(isVerbose),
).pipe(Command.withDescription('Open the current state in the terminal client'))

const open = Command.make('open').pipe(Command.withSubcommands([tui]))

const counter = Command.make('foldkit-counter').pipe(
  Command.withSubcommands([show, increment, decrement, reset, open]),
)

Command.run(counter, { version: '0.0.0' }).pipe(
  Effect.provide(
    Layer.mergeAll(
      NodeServices.layer,
      makeNodeClientLauncherLayer(tuiEntryPath).pipe(
        Layer.provide(NodeServices.layer),
      ),
    ),
  ),
  NodeRuntime.runMain,
)
