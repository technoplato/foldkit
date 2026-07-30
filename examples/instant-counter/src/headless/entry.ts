import { Effect } from 'effect'

import { runHeadlessAuthority } from './authority.js'
import { makeHeadlessDatabases } from './database.js'
import {
  headlessStatePathFromEnvironment,
  makeHeadlessLocalState,
} from './localState.js'
import { runSessionMaterializer } from './sessionMaterializer.js'

const program = Effect.scoped(
  Effect.gen(function* () {
    const databases = yield* makeHeadlessDatabases()
    const localState = yield* makeHeadlessLocalState(
      headlessStatePathFromEnvironment(),
    )
    process.stdout.write(
      'Foldkit Instant headless authority is observing authenticated sessions.\n',
    )
    return yield* Effect.all(
      [
        runSessionMaterializer(databases.admin),
        runHeadlessAuthority({ databases, localState }),
      ],
      { concurrency: 'unbounded', discard: true },
    )
  }),
)

void Effect.runPromise(program).catch(() => {
  process.stderr.write(
    'Foldkit Instant headless authority stopped after a sanitized fatal error.\n',
  )
  process.exitCode = 1
})
