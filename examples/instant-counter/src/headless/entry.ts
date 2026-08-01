import { Effect } from 'effect'

import { runHeadlessAdmissionSequencer } from './authority.js'
import { makeHeadlessDatabases } from './database.js'
import { runLegacyRoutingMigration } from './legacyRoutingMigration.js'
import {
  headlessStatePathFromEnvironment,
  makeHeadlessLocalState,
} from './localState.js'
import { runSessionMaterializer } from './sessionMaterializer.js'
import { headlessSubjectScopeFromEnvironment } from './subjectScope.js'

const program = Effect.scoped(
  Effect.gen(function* () {
    const databases = yield* makeHeadlessDatabases()
    const migrationCounts = yield* runLegacyRoutingMigration(databases.admin)
    process.stdout.write(
      `Foldkit Instant legacy routing preflight completed: ${migrationCounts.acceptedOccurrences.toString()} accepted Message occurrences, ${migrationCounts.messageProposals.toString()} Message proposals, ${migrationCounts.messageProposalResolutions.toString()} proposal resolutions, ${migrationCounts.effectRequests.toString()} effect requests, ${migrationCounts.effectPlacements.toString()} effect placements, and ${migrationCounts.projectionCheckpoints.toString()} projection checkpoints upgraded.\n`,
    )
    const localState = yield* makeHeadlessLocalState(
      headlessStatePathFromEnvironment(),
    )
    const subjectScope = headlessSubjectScopeFromEnvironment()
    process.stdout.write(
      'Foldkit Instant headless admission sequencer is observing authenticated sessions.\n',
    )
    return yield* Effect.all(
      [
        runSessionMaterializer(databases.admin, subjectScope),
        runHeadlessAdmissionSequencer({ databases, localState, subjectScope }),
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
