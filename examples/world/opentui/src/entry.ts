#!/usr/bin/env node
import { Effect } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runWorldTui } from './host.js'

runWorldTui().pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
