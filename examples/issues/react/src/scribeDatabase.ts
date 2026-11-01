import { Effect } from 'effect'
import { IssueLandingError, type LandingsDatabase } from 'issues-core-example'

import { ensureHostedInstantSession } from '@foldkit/instant'
import { init } from '@instantdb/core'

/** The mint for Scribe's app on this site's origin (`vite.config.ts`). */
const SCRIBE_SESSION_PATH = '/__foldkit/hosted-identity/scribe/session'
const SIGN_IN_TIMEOUT_MS = 5_000

const boundedFetch: typeof fetch = (input, requestInit) =>
  fetch(input, {
    ...requestInit,
    signal: AbortSignal.timeout(SIGN_IN_TIMEOUT_MS),
  })

/**
 * Scribe's Instant client, opened and signed in once, the first time a page
 * asks for it: the same Access login, minted on this site's origin. Refusing
 * the mint or no sign-in is a failure a page can say, never rows that look
 * empty.
 */
export const openedScribeDatabase = (
  appId: string,
): Effect.Effect<LandingsDatabase, IssueLandingError> => {
  const opening = Effect.runSync(
    Effect.cached(
      Effect.tryPromise({
        try: async () => {
          const database = init({ appId })
          const member = await ensureHostedInstantSession(database, {
            fetch: boundedFetch,
            sessionUrl: SCRIBE_SESSION_PATH,
          })
          if (member === null) {
            throw new Error('This page is not signed in to Scribe.')
          }
          return database
        },
        catch: cause => new IssueLandingError({ cause }),
      }),
    ),
  )
  return opening
}
