#!/usr/bin/env node
import { Effect } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runAdvocacyTui } from './host.js'

runAdvocacyTui().pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
