import { Effect } from 'effect'

import { runHeadlessAdmissionSequencer } from './authority.js'
import { makeHeadlessDatabases } from './database.js'
import {
  headlessStatePathFromEnvironment,
  makeHeadlessLocalState,
} from './localState.js'
import { runSessionMaterializer } from './sessionMaterializer.js'
import { headlessSubjectScopeFromEnvironment } from './subjectScope.js'

const program = Effect.scoped(
  Effect.gen(function* () {
    const databases = yield* makeHeadlessDatabases()
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
