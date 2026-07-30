import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { txInit, validateTransactions } from '@instantdb/core'

import { schema } from '../../instant.schema.js'
import {
  InstantCounterSessionClaim,
  makeSessionClaimTransaction,
} from './sessionClaim.js'

describe('InstantCounterSessionClaim', () => {
  it('uses a unique subject lookup without deriving an entity ID in the Client', () => {
    const transactions = txInit<typeof schema>()
    const transaction = makeSessionClaimTransaction(
      transactions,
      'subject-1',
      1_753_825_100_000,
    )

    expect(() => validateTransactions(transaction, schema)).not.toThrow()
    expect(
      Array.map(transaction.__ops, operation =>
        Option.getOrThrow(Array.head(operation)),
      ),
    ).toEqual(['update'])
    expect(transaction.__ops).toEqual([
      [
        'update',
        'instantCounterSessionClaims',
        ['subjectId', 'subject-1'],
        {
          claimedAtMs: 1_753_825_100_000,
          subjectId: 'subject-1',
        },
      ],
    ])
  })

  it('decodes only complete persisted claims', () => {
    expect(
      S.decodeUnknownSync(InstantCounterSessionClaim)({
        claimedAtMs: 1_753_825_100_000,
        id: 'server-generated-id',
        subjectId: 'subject-1',
      }),
    ).toEqual({
      claimedAtMs: 1_753_825_100_000,
      id: 'server-generated-id',
      subjectId: 'subject-1',
    })
    expect(() =>
      S.decodeUnknownSync(InstantCounterSessionClaim)({
        claimedAtMs: 1_753_825_100_000,
        id: 'server-generated-id',
      }),
    ).toThrow()
  })
})
