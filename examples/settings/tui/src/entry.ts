#!/usr/bin/env node
import { Effect } from 'effect'
import {
  SettingsOriginHttpLive,
  SettingsOriginTest,
} from 'settings-core-example'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runSettingsTui } from './host.js'

const originLayer =
  process.env['GATE_ORIGIN'] === 'test'
    ? SettingsOriginTest
    : SettingsOriginHttpLive

runSettingsTui(originLayer).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
