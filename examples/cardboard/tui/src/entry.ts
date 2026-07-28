#!/usr/bin/env node
import { Effect } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runCardboardTui } from './host.js'

runCardboardTui().pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
