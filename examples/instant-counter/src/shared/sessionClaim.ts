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
    .update({ claimedAtMs, subjectId })
}

const readSessionClaim = (
  database: InstantCounterDatabase,
  subjectId: string,
): Promise<Option.Option<InstantCounterSessionClaim>> =>
  new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | undefined
    let isSettled = false

    const close = (): void => {
      if (unsubscribe !== undefined) {
        unsubscribe()
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
    const fail = (): void => {
      if (!isSettled) {
        isSettled = true
        close()
        reject(new Error('Unable to read the authenticated session claim.'))
      }
    }

    unsubscribe = database.subscribeQuery(
      {
        instantCounterSessionClaims: {
          $: { where: { subjectId } },
        },
      },
      payload => {
        if (payload.error !== undefined) {
          fail()
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

/** Ensures the browser has submitted exactly one own-subject session claim. */
export const ensureSessionClaim = async (
  database: InstantCounterDatabase,
  subjectId: string,
  now: () => number = Date.now,
): Promise<void> => {
  const maybeClaim = await readSessionClaim(database, subjectId)
  if (Option.isSome(maybeClaim)) {
    return
  }

  try {
    await database.transact(
      makeSessionClaimTransaction(database.tx, subjectId, now()),
    )
  } catch {
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
