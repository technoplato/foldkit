#!/usr/bin/env node
import { Effect } from 'effect'
import { Argument, Command } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runHeadless, watchHeadless } from './host.js'

const tokensArgument = Argument.string('token').pipe(
  Argument.variadic({ min: 0 }),
)

const show = Command.make('show', {}, () => runHeadless([])).pipe(
  Command.withDescription('Print one headless Multiple Counters snapshot'),
)

const run = Command.make('run', { tokens: tokensArgument }, ({ tokens }) =>
  runHeadless(tokens),
).pipe(
  Command.withDescription('Run one headless action and print the snapshot'),
)

const watch = Command.make('watch', {}, () => watchHeadless()).pipe(
  Command.withDescription('Keep one headless Processor on the Instant tape'),
)

const counters = Command.make('foldkit-counters-headless').pipe(
  Command.withSubcommands([show, run, watch]),
)

Command.run(counters, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
