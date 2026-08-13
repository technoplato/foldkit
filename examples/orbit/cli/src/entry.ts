#!/usr/bin/env node
import { Effect } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runCli } from './host.js'

runCli().pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
