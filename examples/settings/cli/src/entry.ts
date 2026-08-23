#!/usr/bin/env node
import { Effect } from 'effect'
import { Command } from 'effect/unstable/cli'
import {
  SettingsOriginHttpLive,
  SettingsOriginTest,
} from 'settings-core-example'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runSettingsRefresh, runSettingsShow } from './host.js'

const originLayer =
  process.env['GATE_ORIGIN'] === 'test'
    ? SettingsOriginTest
    : SettingsOriginHttpLive

const show = Command.make('show', {}, () => runSettingsShow(originLayer)).pipe(
  Command.withDescription('Print the Settings screen'),
)

const refresh = Command.make('refresh', {}, () =>
  runSettingsRefresh(originLayer),
).pipe(
  Command.withDescription(
    'Read the origin again and print the Settings screen',
  ),
)

const settings = Command.make('foldkit-settings').pipe(
  Command.withSubcommands([show, refresh]),
)

Command.run(settings, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
