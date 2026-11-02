import { Duration, Effect, Option } from 'effect'
import {
  type FindingPromotion,
  type GraphDatabase,
  IssueLandingError,
  IssueViewError,
  type IssueViewsDatabase,
  type LandingsDatabase,
} from 'issues-core-example'

import { ensureHostedInstantSession } from '@foldkit/instant'
import { id, init } from '@instantdb/core'

/** The mint for Scribe's app on this site's origin (`vite.config.ts`). */
const SCRIBE_SESSION_PATH = '/__foldkit/hosted-identity/scribe/session'
const SIGN_IN_TIMEOUT_MS = 5_000

const boundedFetch: typeof fetch = (input, requestInit) =>
  fetch(input, {
    ...requestInit,
    signal: AbortSignal.timeout(SIGN_IN_TIMEOUT_MS),
  })

const scribeClient = (appId: string) => init({ appId })

/** Scribe's Instant client, and who it is signed in as. */
export type ScribeDatabase = Readonly<{
  database: ReturnType<typeof scribeClient>
  ownerUserId: string
}>

/**
 * Scribe's Instant client, opened once, the first time a page asks for it,
 * and signed in with the same Access login, minted on this site's origin. A
 * sign-in that worked is kept; one that failed is tried again the next time a
 * page asks, so one refused mint never leaves the tab without Scribe's rows.
 * Refusing the mint or no sign-in is a failure a page can say, never rows that
 * look empty.
 */
export const openedScribeDatabase = (
  appId: string,
): Effect.Effect<ScribeDatabase, IssueLandingError> => {
  const opened = Effect.runSync(
    Effect.cached(Effect.sync(() => scribeClient(appId))),
  )
  const signedIn = Effect.flatMap(opened, database =>
    Effect.tryPromise({
      try: async () => {
        const member = await ensureHostedInstantSession(database, {
          fetch: boundedFetch,
          sessionUrl: SCRIBE_SESSION_PATH,
        })
        if (member === null) {
          throw new Error('This page is not signed in to Scribe.')
        }
        return { database, ownerUserId: member.id }
      },
      catch: cause => new IssueLandingError({ cause }),
    }),
  )
  const [opening, forget] = Effect.runSync(
    Effect.cachedInvalidateWithTTL(signedIn, Duration.infinity),
  )
  return opening.pipe(Effect.tapError(() => forget))
}

const findingRowOf = (
  database: ScribeDatabase['database'],
  findingId: string,
) =>
  Option.getOrThrow(
    Option.fromUndefinedOr(database.tx['agentFindings']?.[findingId]),
  )

/** Scribe's client as where the graph is read and a finding marked. */
export const scribeGraph = (
  opening: Effect.Effect<ScribeDatabase, IssueLandingError>,
): Effect.Effect<GraphDatabase, IssueLandingError> =>
  Effect.map(opening, ({ database }) => ({
    subscribeQuery: (query, onResponse) =>
      database.subscribeQuery(query, onResponse),
    updateFinding: (findingId: string, promotion: FindingPromotion) =>
      database.transact(findingRowOf(database, findingId).update(promotion)),
  }))

/** Scribe's client as where an Issue landed is read. */
export const scribeLandings = (
  opening: Effect.Effect<ScribeDatabase, IssueLandingError>,
): Effect.Effect<LandingsDatabase, IssueLandingError> =>
  Effect.map(opening, ({ database }) => database)

const viewRowOf = (database: ScribeDatabase['database'], viewId: string) =>
  Option.getOrThrow(Option.fromUndefinedOr(database.tx['issueViews']?.[viewId]))

const viewsDatabaseOf = ({
  database,
  ownerUserId,
}: ScribeDatabase): IssueViewsDatabase => ({
  deleteRow: viewId => database.transact(viewRowOf(database, viewId).delete()),
  newId: id,
  nowMs: Date.now,
  ownerUserId,
  saveRow: (viewId, row) =>
    database.transact(viewRowOf(database, viewId).update(row)),
  subscribeQuery: (query, onResponse) =>
    database.subscribeQuery(query, onResponse),
})

/** Scribe's client as where saved views are read and written. */
export const scribeViews = (
  opening: Effect.Effect<ScribeDatabase, IssueLandingError>,
): Effect.Effect<IssueViewsDatabase, IssueViewError> =>
  opening.pipe(
    Effect.map(viewsDatabaseOf),
    Effect.mapError(error => new IssueViewError({ cause: error.cause })),
  )
