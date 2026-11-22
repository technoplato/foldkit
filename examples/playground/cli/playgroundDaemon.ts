#!/usr/bin/env node
/**
 * The Playground Background Processor on the shared InstantDB log
 * (`foldkit-playground`). The first `playground` command starts it; later
 * commands talk to its socket so they reuse one Instant WebSocket connection.
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
  SyncedPlayground,
  makePlaygroundInstance,
  playgroundCommandName,
  playgroundProgramId,
} from '../src/playgroundCore'

const readyTimeoutMs = 20_000
const playgroundIsolationKey = 'instant'

const serve = Effect.gen(function* () {
  const stopping = yield* Deferred.make<void>()
  const stopSignal = (): void => {
    Deferred.doneUnsafe(stopping, Effect.void)
  }
  process.once('SIGTERM', stopSignal)
  process.once('SIGINT', stopSignal)

  const instance = makePlaygroundInstance()
  const host = Processor.Host.Cli()
  const stateDir = join(homedir(), '.cache', 'foldkit', playgroundProgramId)
  const database = makeNodeInstantDatabase(SharedInstantProject.id, stateDir)
  const sync = Instant({
    app: SharedInstantProject,
    processor: host,
    instance,
    programLog: playgroundProgramId,
    database,
  })
  const handle = Runtime.startHandle({
    program: SyncedPlayground,
    sync,
    localSnapshot: localSnapshotFile(localSnapshotPath(playgroundProgramId)),
    host,
  })
  yield* Effect.addFinalizer(() => Effect.promise(() => handle.stop()))

  const bound = Interaction.bind(SyncedPlayground, handle)
  yield* Effect.promise(() => Interaction.whenSettled(bound, readyTimeoutMs))

  return yield* listenBackgroundProcessor({
    socketPath: backgroundProcessorSocketPath({
      programId: playgroundProgramId,
      isolationKey: playgroundIsolationKey,
    }),
    Model: SyncedPlayground.Model,
    Message: SyncedPlayground.Message,
    surface: programCliSurface(bound, playgroundCommandName),
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
