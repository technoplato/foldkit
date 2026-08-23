#!/usr/bin/env node
import { Effect } from 'effect'
import { Command } from 'effect/unstable/cli'
import { GateOriginHttpLive, GateOriginTest } from 'gate-core-example'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runGateRefresh, runGateShow } from './host.js'

const originLayer =
  process.env['GATE_ORIGIN'] === 'test' ? GateOriginTest : GateOriginHttpLive

const show = Command.make('show', {}, () => runGateShow(originLayer)).pipe(
  Command.withDescription('Print the Gate screen'),
)

const refresh = Command.make('refresh', {}, () =>
  runGateRefresh(originLayer),
).pipe(
  Command.withDescription('Read the origin again and print the Gate screen'),
)

const gate = Command.make('foldkit-gate').pipe(
  Command.withSubcommands([show, refresh]),
)

Command.run(gate, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
