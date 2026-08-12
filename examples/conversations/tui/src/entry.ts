#!/usr/bin/env node
import { Effect } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runConversationsTui } from './host.js'

runConversationsTui().pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
