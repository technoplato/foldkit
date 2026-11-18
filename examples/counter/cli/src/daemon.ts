#!/usr/bin/env node
/**
 * The Counter's Background Processor on the shared Instant tape. The first
 * `counter` command starts it; later commands talk to its socket, so they
 * reuse one Instant connection. Paint stays here.
 */
import { SyncedCounter } from 'counter-core-example'
import { Effect } from 'effect'
import {
  backgroundProcessorSocketPath,
  listenBackgroundProcessor,
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
  return yield* listenBackgroundProcessor({
    socketPath: backgroundProcessorSocketPath({
      programId: counterCliProgramId,
      isolationKey: counterCliIsolationKey,
    }),
    Model: SyncedCounter.Model,
    Message: SyncedCounter.Message,
    surface: programCliSurface(session.bound, 'counter'),
  })
})

NodeRuntime.runMain(Effect.scoped(serve))
