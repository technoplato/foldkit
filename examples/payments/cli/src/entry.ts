#!/usr/bin/env node
import { Effect } from 'effect'
import { Argument, Command } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runPaymentsDo, runPaymentsShow } from './host.js'

const tokensArgument = Argument.string('token').pipe(
  Argument.variadic({ min: 1 }),
)

const show = Command.make('show', {}, () => runPaymentsShow()).pipe(
  Command.withDescription('Print the Payments Program Model'),
)

const doCommand = Command.make('do', { tokens: tokensArgument }, ({ tokens }) =>
  runPaymentsDo(tokens),
).pipe(
  Command.withDescription(
    'Dispatch Messages: select <rail>, record <field>, connect, start, verify, reset',
  ),
)

const payments = Command.make('foldkit-payments').pipe(
  Command.withSubcommands([show, doCommand]),
)

Command.run(payments, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
