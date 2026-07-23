#!/usr/bin/env node
import { Effect } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runCounterTui } from './host.js'

runCounterTui().pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
