#!/usr/bin/env node
import { Effect } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runOrbitTui } from './host.js'

runOrbitTui().pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
