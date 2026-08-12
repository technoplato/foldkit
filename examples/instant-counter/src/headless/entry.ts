import { Effect } from 'effect'
import { randomUUID } from 'node:crypto'

import { runMultipleCountersV3HeadlessAuthority } from '../v3Demo/headless/authority.js'
import {
  isMultipleCountersV3DebugLoginEnabled,
  runMultipleCountersV3DebugLoginServer,
} from '../v3Demo/headless/debugLoginServer.js'
import { multipleCountersV3SessionEpochSeed } from '../v3Demo/shared/identity.js'
import { makeHeadlessDatabases } from './database.js'
import { runLegacyRoutingMigration } from './legacyRoutingMigration.js'

const program = Effect.scoped(
  Effect.gen(function* () {
    const databases = yield* makeHeadlessDatabases()
    const migrationCounts = yield* runLegacyRoutingMigration(databases.admin)
    process.stdout.write(
      `Foldkit Instant legacy routing preflight completed: ${migrationCounts.acceptedOccurrences.toString()} accepted Message occurrences, ${migrationCounts.messageProposals.toString()} Message proposals, ${migrationCounts.messageProposalResolutions.toString()} proposal resolutions, ${migrationCounts.effectRequests.toString()} effect requests, ${migrationCounts.effectPlacements.toString()} effect placements, and ${migrationCounts.projectionCheckpoints.toString()} projection checkpoints upgraded.\n`,
    )
    process.stdout.write(
      'Foldkit Instant headless admission sequencer is observing authenticated sessions.\n',
    )
    const authority = runMultipleCountersV3HeadlessAuthority({
      adminDatabase: databases.admin,
      authorityProcessorId: 'headless-authority',
      makeEntityId: () => randomUUID(),
      now: () => Date.now(),
      onDefect: cause => {
        process.stderr.write(
          `Foldkit Instant v3 authority recorded a sanitized defect: ${String(cause).slice(0, 240)}\n`,
        )
      },
      sessionEpochSeed: multipleCountersV3SessionEpochSeed,
      writer: {
        processId: 'headless-process',
        writeIsolation: 'ExclusiveSerializedWriter',
      },
    })
    if (!isMultipleCountersV3DebugLoginEnabled()) {
      return yield* authority
    }
    return yield* Effect.all(
      [
        runMultipleCountersV3DebugLoginServer(databases.admin.auth),
        authority,
      ],
      { concurrency: 'unbounded', discard: true },
    )
  }),
)

void Effect.runPromise(program).catch(() => {
  process.stderr.write(
    'Foldkit Instant headless admission sequencer stopped after a sanitized fatal error.\n',
  )
  process.exitCode = 1
})
