import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { AssetAmount, type TransactionRecord } from 'wallet-core-example'

import {
  type ActivityRow,
  type WatchedAccount,
  accountKeyOf,
  newestTransactionId,
  nextActivityRow,
  observedActivityRow,
  ownerUserIdOfHolder,
  transactionKeyOf,
} from './activity.js'

const holder = `brandon-dot:${'a'.repeat(64)}`
const address = 'So1anaAddress1111111111111111111111111111111'

const account: WatchedAccount = {
  accountKey: accountKeyOf({ holder, networkId: 'solana:devnet', address }),
  holder,
  chainId: 'solana',
  networkId: 'solana:devnet',
  address,
  maybeCursor: Option.none(),
}

const record = (
  fields: Partial<typeof TransactionRecord.Type> = {},
): typeof TransactionRecord.Type => ({
  recordId: 'r1',
  transactionId: '5hSignature',
  accountId: 'wallet-1:solana:devnet',
  networkId: 'solana:devnet',
  direction: 'Incoming',
  status: 'Confirmed',
  amount: AssetAmount.make({
    assetId: 'solana:devnet:sol',
    atomicUnits: '500000000',
    observedAt: 1_793_490_000_000,
  }),
  counterpartyAddress: 'Sender111111111111111111111111111111111111',
  normalizedCounterpartyAddress: 'Sender111111111111111111111111111111111111',
  observedAt: 1_793_490_000_000,
  ...fields,
})

describe('keys', () => {
  it('names an account by holder, network and address, and a transaction under it', () => {
    expect(account.accountKey).toBe(`${holder}|solana:devnet|${address}`)
    expect(transactionKeyOf(account.accountKey, '5hSignature')).toBe(
      `${holder}|solana:devnet|${address}|5hSignature`,
    )
  })
})

describe('a record from the chain', () => {
  it('becomes a row with finality from its status', () => {
    const row = observedActivityRow(account, record())
    expect(row.transactionKey).toBe(`${account.accountKey}|5hSignature`)
    expect(row.status).toBe('Confirmed')
    expect(row.maybeFinality).toEqual(Option.some('Included'))
    expect(row.amountAtomic).toBe('500000000')
    expect(row.assetId).toBe('solana:devnet:sol')
    expect(row.maybeConfirmedAtMs).toEqual(Option.some(1_793_490_000_000))
    expect(
      observedActivityRow(account, record({ status: 'Pending' })).maybeFinality,
    ).toEqual(Option.some('Seen'))
  })

  it('is refused on a network other than its account', () => {
    expect(() =>
      observedActivityRow(account, record({ networkId: 'solana:mainnet-beta' })),
    ).toThrow()
  })
})

describe('the next row to write', () => {
  const included = observedActivityRow(account, record())

  it('writes a transaction seen for the first time', () => {
    expect(nextActivityRow(Option.none(), included)).toEqual(
      Option.some(included),
    )
  })

  it('writes nothing for a transaction it already holds as it is', () => {
    expect(nextActivityRow(Option.some(included), included)).toEqual(
      Option.none(),
    )
  })

  it('moves a Pending send forward and keeps when it was first seen', () => {
    const pending = observedActivityRow(
      account,
      record({ status: 'Pending', observedAt: 1 }),
    )
    const next = nextActivityRow(Option.some(pending), included)
    expect(Option.map(next, row => row.status)).toEqual(Option.some('Confirmed'))
    expect(Option.map(next, row => row.observedAtMs)).toEqual(Option.some(1))
  })

  it("keeps the address a sender recorded when the chain's record names none", () => {
    const sent: ActivityRow = {
      ...observedActivityRow(account, record({ status: 'Pending' })),
      maybeFinality: Option.none(),
      maybeCounterpartyAddress: Option.some('Recipient111'),
    }
    const observed = observedActivityRow(
      account,
      record({ counterpartyAddress: '' }),
    )
    expect(
      Option.map(
        nextActivityRow(Option.some(sent), observed),
        row => row.maybeCounterpartyAddress,
      ),
    ).toEqual(Option.some(Option.some('Recipient111')))
  })

  it('never moves a row back on a stale observation', () => {
    const pending = observedActivityRow(account, record({ status: 'Pending' }))
    expect(nextActivityRow(Option.some(included), pending)).toEqual(
      Option.none(),
    )
  })

  it('never changes a Final row', () => {
    const final: ActivityRow = {
      ...included,
      maybeFinality: Option.some('Final'),
    }
    const failed = observedActivityRow(account, record({ status: 'Failed' }))
    expect(nextActivityRow(Option.some(final), failed)).toEqual(Option.none())
    expect(nextActivityRow(Option.some(final), included)).toEqual(Option.none())
  })
})

describe('the cursor', () => {
  it('is the newest transaction seen, or the old one when nothing is newer', () => {
    const records = [
      record({ transactionId: 'older', observedAt: 1 }),
      record({ transactionId: 'newest', observedAt: 3 }),
      record({ transactionId: 'middle', observedAt: 2 }),
    ]
    expect(newestTransactionId(records, Option.none())).toEqual(
      Option.some('newest'),
    )
    expect(newestTransactionId([], Option.some('kept'))).toEqual(
      Option.some('kept'),
    )
  })
})

describe("an account's rows", () => {
  const originOwner = '155454dd-e60a-4a4d-82d7-4ead5f8df4fa'

  it('belong to the Scribe user their holder names, so that user can read them', () => {
    const phoneUser = '2fd17171-0000-4000-8000-000000000000'
    expect(ownerUserIdOfHolder(`scribe:${phoneUser}`, originOwner)).toBe(
      phoneUser,
    )
  })

  it("stay the origin's for a Brandon dot person, so no client reads them", () => {
    expect(
      ownerUserIdOfHolder(`brandon-dot:${'a'.repeat(64)}`, originOwner),
    ).toBe(originOwner)
  })
})
