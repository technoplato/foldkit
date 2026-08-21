#!/usr/bin/env node
import { Effect } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runTranscribeTui } from './host.js'

runTranscribeTui().pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
