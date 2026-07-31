import { Array, Option, Schema as S } from 'effect'

import type { InstantCounterDatabase } from '../../instant.schema.js'

/** One authenticated request for the trusted headless host to materialize a session. */
export const InstantCounterSessionClaim = S.Struct({
  claimedAtMs: S.Int,
  id: S.String,
  subjectId: S.String,
})

/** One authenticated request for the trusted headless host to materialize a session. */
export type InstantCounterSessionClaim = typeof InstantCounterSessionClaim.Type

const decodeSessionClaimForSubject = (
  records: ReadonlyArray<unknown>,
  subjectId: string,
): Option.Option<InstantCounterSessionClaim> =>
  Array.findFirst(
    Array.getSomes(
      Array.map(records, record =>
        S.decodeUnknownOption(InstantCounterSessionClaim)(record),
      ),
    ),
    claim => claim.subjectId === subjectId,
  )

/** Upserts a new own-subject claim through its unique subject lookup. */
export const makeSessionClaimTransaction = (
  transactions: InstantCounterDatabase['tx'],
  subjectId: string,
  claimedAtMs: number,
) => {
  return transactions.instantCounterSessionClaims
    .lookup('subjectId', subjectId)
    .update({ claimedAtMs })
}

const readSessionClaim = (
  database: InstantCounterDatabase,
  subjectId: string,
  signal: AbortSignal | undefined,
): Promise<Option.Option<InstantCounterSessionClaim>> =>
  new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | undefined
    let isSettled = false

    const close = (): void => {
      signal?.removeEventListener('abort', abort)
      const closeSubscription = unsubscribe
      unsubscribe = undefined
      if (closeSubscription !== undefined) {
        closeSubscription()
      }
    }
    const succeed = (
      maybeClaim: Option.Option<InstantCounterSessionClaim>,
    ): void => {
      if (!isSettled) {
        isSettled = true
        close()
        resolve(maybeClaim)
      }
    }
    const fail = (cause: unknown): void => {
      if (!isSettled) {
        isSettled = true
        close()
        reject(cause)
      }
    }
    const abort = (): void => {
      fail(new Error('The authenticated session claim was cancelled.'))
    }

    if (signal?.aborted === true) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
    unsubscribe = database.subscribeQuery(
      {
        instantCounterSessionClaims: {
          $: { where: { subjectId } },
        },
      },
      payload => {
        if (payload.error !== undefined) {
          fail(new Error('Unable to read the authenticated session claim.'))
        } else {
          succeed(
            decodeSessionClaimForSubject(
              payload.data.instantCounterSessionClaims,
              subjectId,
            ),
          )
        }
      },
    )
    if (isSettled) {
      close()
    }
  })

/** Options for one cancellable authenticated session claim. */
export type EnsureSessionClaimOptions = Readonly<{
  now?: () => number
  signal?: AbortSignal | undefined
}>

const ensureSessionClaimWasNotCancelled = (
  signal: AbortSignal | undefined,
): void => {
  if (signal?.aborted === true) {
    throw new Error('The authenticated session claim was cancelled.')
  }
}

/** Ensures one authenticated Client has submitted its own session claim. */
export const ensureSessionClaim = async (
  database: InstantCounterDatabase,
  subjectId: string,
  options: EnsureSessionClaimOptions = {},
): Promise<void> => {
  const maybeClaim = await readSessionClaim(database, subjectId, options.signal)
  if (Option.isSome(maybeClaim)) {
    return
  }
  ensureSessionClaimWasNotCancelled(options.signal)

  try {
    await database.transact(
      makeSessionClaimTransaction(
        database.tx,
        subjectId,
        (options.now ?? Date.now)(),
      ),
    )
  } catch {
    ensureSessionClaimWasNotCancelled(options.signal)
    try {
      const existing = await database.queryOnce({
        instantCounterSessionClaims: {
          $: { where: { subjectId } },
        },
      })
      const maybeExistingClaim = decodeSessionClaimForSubject(
        existing.data.instantCounterSessionClaims,
        subjectId,
      )
      if (Option.isSome(maybeExistingClaim)) {
        return
      }
    } catch {
      throw new Error('Unable to create the authenticated session claim.')
    }
    throw new Error('Unable to create the authenticated session claim.')
  }
}
