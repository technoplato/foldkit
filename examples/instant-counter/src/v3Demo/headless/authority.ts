import { Effect, Scope } from 'effect'

import {
  type InstantV3EntityId,
  type InstantV3TimestampMs,
  makeV3InstantProgramAuthorityStore,
} from '@foldkit/instant'

import { runMultipleCountersV3AcceptanceSupervisor } from './acceptanceSupervisor.js'
import {
  type MultipleCountersV3AdminDatabase,
  type MultipleCountersV3AuthorityWriterDeclaration,
  acquireMultipleCountersV3HeadlessDatabase,
} from './adminDatabase.js'
import { runMultipleCountersV3EnrollmentMaterializer } from './enrollmentMaterializer.js'
import { runMultipleCountersV3PolicySupervisor } from './policySupervisor.js'

/** Complete configuration for the sole trusted protocol-v3 headless process. */
export type MultipleCountersV3HeadlessAuthorityConfig = Readonly<{
  adminDatabase: MultipleCountersV3AdminDatabase
  authorityProcessorId: string
  makeEntityId: () => InstantV3EntityId
  now: () => InstantV3TimestampMs
  onDefect?: (cause: unknown) => void
  sessionEpochSeed: string
  writer: MultipleCountersV3AuthorityWriterDeclaration
}>

/** Runs enrollment and per-session acceptance under one exclusive writer lease. */
export const runMultipleCountersV3HeadlessAuthority = (
  config: MultipleCountersV3HeadlessAuthorityConfig,
): Effect.Effect<never, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const database = yield* acquireMultipleCountersV3HeadlessDatabase(
      config.adminDatabase,
      config.writer,
    )
    const storeConfig =
      config.onDefect === undefined
        ? {}
        : { onConnectionDefect: config.onDefect }
    const store = yield* makeV3InstantProgramAuthorityStore(
      database.authority,
      storeConfig,
    )
    const enrollment = runMultipleCountersV3EnrollmentMaterializer(
      database.enrollmentClaims,
      {
        authorityProcessorId: config.authorityProcessorId,
        onRejectedClaim: error => {
          config.onDefect?.(error)
        },
        now: config.now,
        sessionEpochSeed: config.sessionEpochSeed,
        store,
      },
    )
    const acceptance = runMultipleCountersV3AcceptanceSupervisor(
      database,
      store,
      {
        authorityProcessorId: config.authorityProcessorId,
        makeEntityId: config.makeEntityId,
        now: config.now,
        onSessionDefect: cause => {
          config.onDefect?.(cause)
        },
        sessionEpochSeed: config.sessionEpochSeed,
      },
    )
    const policies = runMultipleCountersV3PolicySupervisor(database, store, {
      authorityProcessorId: config.authorityProcessorId,
      now: config.now,
      onDefect: error => {
        config.onDefect?.(error)
      },
    })
    return yield* Effect.all([enrollment, acceptance, policies], {
      concurrency: 'unbounded',
      discard: true,
    }).pipe(Effect.flatMap(() => Effect.never))
  })
