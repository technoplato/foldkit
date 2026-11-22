#!/usr/bin/env node
/**
 * The Studio Background Processor on the shared InstantDB log (`foldkit-studio`).
 * The first `studio` command starts it; later commands talk to its socket so
 * they reuse one Instant WebSocket connection and answer immediately.
 */
import { Deferred, Effect } from 'effect'
import { Interaction, Processor, Runtime } from 'foldkit'
import {
  backgroundProcessorSocketPath,
  listenBackgroundProcessor,
  localSnapshotFile,
  localSnapshotPath,
  programCliSurface,
} from 'foldkit/cli'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { makeNodeInstantDatabase } from '@foldkit/instant'
import { Instant, SharedInstantProject } from '@foldkit/instant/browser'

import {
  SyncedStudio,
  makeStudioInstance,
  studioCommandName,
  studioProgramId,
} from '../src/studioCore'

const readyTimeoutMs = 20_000
const studioIsolationKey = 'instant'

const serve = Effect.gen(function* () {
  const stopping = yield* Deferred.make<void>()
  const stopSignal = (): void => {
    Deferred.doneUnsafe(stopping, Effect.void)
  }
  process.once('SIGTERM', stopSignal)
  process.once('SIGINT', stopSignal)

  const instance = makeStudioInstance()
  const host = Processor.Host.Cli()
  const stateDir = join(homedir(), '.cache', 'foldkit', studioProgramId)
  const database = makeNodeInstantDatabase(SharedInstantProject.id, stateDir)
  const sync = Instant({
    app: SharedInstantProject,
    processor: host,
    instance,
    programLog: studioProgramId,
    database,
  })
  const handle = Runtime.startHandle({
    program: SyncedStudio,
    sync,
    localSnapshot: localSnapshotFile(localSnapshotPath(studioProgramId)),
    host,
  })
  yield* Effect.addFinalizer(() => Effect.promise(() => handle.stop()))

  const bound = Interaction.bind(SyncedStudio, handle)
  yield* Effect.promise(() => Interaction.whenSettled(bound, readyTimeoutMs))

  return yield* listenBackgroundProcessor({
    socketPath: backgroundProcessorSocketPath({
      programId: studioProgramId,
      isolationKey: studioIsolationKey,
    }),
    Model: SyncedStudio.Model,
    Message: SyncedStudio.Message,
    surface: programCliSurface(bound, studioCommandName),
    until: Deferred.await(stopping),
  })
})

Effect.runPromise(Effect.scoped(serve)).then(
  () => {
    process.exit(0)
  },
  error => {
    process.stderr.write(`${String(error)}\n`)
    process.exit(1)
  },
)
