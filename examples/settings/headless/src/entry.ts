#!/usr/bin/env node
import {
  SettingsOriginHttpLive,
  SettingsOriginTest,
} from 'settings-core-example'

import { NodeRuntime } from '@effect/platform-node'

import { runSettingsHeadless } from './host.js'

const originLayer =
  process.env['GATE_ORIGIN'] === 'test'
    ? SettingsOriginTest
    : SettingsOriginHttpLive

runSettingsHeadless(originLayer).pipe(NodeRuntime.runMain)
