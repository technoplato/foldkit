#!/usr/bin/env node
import { Effect } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runBooksTui } from './host.js'

runBooksTui().pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
