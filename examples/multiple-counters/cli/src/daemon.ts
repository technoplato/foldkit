#!/usr/bin/env node
/**
 * The Counters' Background Processor: one long-lived process that holds
 * the Program on the shared Instant tape. The first `counters` command
 * starts it; later commands talk to its socket, so they reuse one sync
 * connection, and `counters follow` hears every change. Paint stays here.
 */
import { Effect } from 'effect'
import { Interaction, Processor } from 'foldkit'
import {
  backgroundProcessorSocketPath,
  listenBackgroundProcessor,
  programCliSurface,
} from 'foldkit/cli'
import {
  SyncedCounters,
  bindCounters,
  newProcessorInstance,
  startCounters,
} from 'multiple-counters-core-example'

import { NodeRuntime } from '@effect/platform-node'

import { countersCommandName, countersProgramId } from './settings.js'

const readyTimeoutMs = 10_000

const serve = Effect.gen(function* () {
  const handle = startCounters({
    host: Processor.Host.Cli(),
    instance: newProcessorInstance(),
  })
  yield* Effect.addFinalizer(() => Effect.promise(handle.stop))
  const bound = bindCounters(handle)
  yield* Effect.promise(() => Interaction.whenSettled(bound, readyTimeoutMs))
  return yield* listenBackgroundProcessor({
    socketPath: backgroundProcessorSocketPath({
      programId: countersProgramId,
    }),
    Model: SyncedCounters.Model,
    Message: SyncedCounters.Message,
    surface: programCliSurface(bound, countersCommandName),
  })
})

NodeRuntime.runMain(Effect.scoped(serve))
