#!/usr/bin/env node
import { Effect } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runIdeasTui } from './host.js'

runIdeasTui().pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
