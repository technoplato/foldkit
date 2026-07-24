#!/usr/bin/env node
import { NodeRuntime } from '@effect/platform-node'

import {
  optionsFromEnvironment,
  runCounterPortalServer,
} from './portalServer.js'

runCounterPortalServer(optionsFromEnvironment()).pipe(NodeRuntime.runMain)
