#!/usr/bin/env node
/**
 * Long-lived Counter CLI Processor on the shared Instant tape. The first
 * `counter` command starts it; later commands talk to its socket, so they
 * reuse one Instant connection. Paint stays here.
 */
import { SyncedCounter } from 'counter-core-example'
import { Effect } from 'effect'
import {
  cliDaemonSocketPath,
  listenCliDaemon,
  programCliSurface,
} from 'foldkit/cli'

import { NodeRuntime } from '@effect/platform-node'

import { openCounterSession } from './session.js'
import { counterCliIsolationKey, counterCliProgramId } from './settings.js'

const serve = Effect.gen(function* () {
  const session = yield* Effect.promise(() =>
    openCounterSession({ _tag: 'Instant' }),
  )
  yield* Effect.addFinalizer(() => Effect.promise(session.stop))
  return yield* listenCliDaemon({
    socketPath: cliDaemonSocketPath({
      programId: counterCliProgramId,
      isolationKey: counterCliIsolationKey(),
    }),
    Model: SyncedCounter.Model,
    Message: SyncedCounter.Message,
    surface: programCliSurface(session.bound, 'counter'),
  })
})

NodeRuntime.runMain(Effect.scoped(serve))
