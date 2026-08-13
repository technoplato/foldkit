#!/usr/bin/env node
import { Effect } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runArchiverTui } from './host.js'

runArchiverTui().pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
