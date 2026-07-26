#!/usr/bin/env node
import { Effect } from 'effect'
import { Argument, Command, Flag } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runCalculatorInput, runCalculatorShow } from './host.js'

const verboseFlag = Flag.boolean('verbose').pipe(
  Flag.withDescription('Print the Model and Message progress to stdout'),
)

const buttonsArgument = Argument.string('button').pipe(
  Argument.variadic({ min: 1 }),
)

const show = Command.make('show', { isVerbose: verboseFlag }, ({ isVerbose }) =>
  runCalculatorShow(isVerbose),
).pipe(Command.withDescription('Print the initial Calculator display'))

const press = Command.make(
  'press',
  { buttons: buttonsArgument, isVerbose: verboseFlag },
  ({ buttons, isVerbose }) => runCalculatorInput(buttons, isVerbose),
).pipe(
  Command.withDescription(
    'Press Calculator buttons and print the resulting display',
  ),
)

const calculator = Command.make('foldkit-calculator').pipe(
  Command.withSubcommands([show, press]),
)

Command.run(calculator, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
