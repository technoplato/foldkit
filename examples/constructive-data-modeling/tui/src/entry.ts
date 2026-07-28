#!/usr/bin/env node
import { Effect } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runDeckTui } from './host.js'

runDeckTui().pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
