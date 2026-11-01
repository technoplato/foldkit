import type { WatchedNetworkId } from 'brandon-core-example'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { AssetAmount, type TransactionRecord } from 'wallet-core-example'

import {
  type ActivityRow,
  type WatchedAccount,
  accountKeyOf,
  msUntilNeverLanded,
  newestTransactionId,
  nextActivityRow,
  observedActivityRow,
  ownerUserIdOfHolder,
  sentActivityRow,
  settledActivityRow,
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

const recordAtMs = 1_793_490_000_000

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
    const row = observedActivityRow(account, record(), { nowMs: recordAtMs })
    expect(row.transactionKey).toBe(`${account.accountKey}|5hSignature`)
    expect(row.status).toBe('Confirmed')
    expect(row.maybeFinality).toEqual(Option.some('Included'))
    expect(row.amountAtomic).toBe('500000000')
    expect(row.assetId).toBe('solana:devnet:sol')
    expect(row.maybeConfirmedAtMs).toEqual(Option.some(1_793_490_000_000))
    expect(
      observedActivityRow(account, record({ status: 'Pending' }), {
        nowMs: recordAtMs,
      }).maybeFinality,
    ).toEqual(Option.some('Seen'))
  })

  it('reads as Final once it is older than its chain could undo', () => {
    const observedAt = 1_793_490_000_000
    const fiveMinutes = 5 * 60 * 1_000
    expect(
      observedActivityRow(account, record({ observedAt }), {
        nowMs: observedAt + fiveMinutes,
      }).maybeFinality,
    ).toEqual(Option.some('Final'))
    expect(
      observedActivityRow(account, record({ observedAt }), {
        nowMs: observedAt + fiveMinutes - 1,
      }).maybeFinality,
    ).toEqual(Option.some('Included'))
    const onEthereum: WatchedAccount = {
      ...account,
      chainId: 'ethereum',
      networkId: 'ethereum:mainnet',
    }
    const hour = 60 * 60 * 1_000
    expect(
      observedActivityRow(
        onEthereum,
        record({ observedAt, networkId: 'ethereum:mainnet' }),
        { nowMs: observedAt + hour - 1 },
      ).maybeFinality,
    ).toEqual(Option.some('Included'))
    expect(
      observedActivityRow(
        onEthereum,
        record({ observedAt, networkId: 'ethereum:mainnet' }),
        { nowMs: observedAt + hour },
      ).maybeFinality,
    ).toEqual(Option.some('Final'))
  })

  it('never reads a failed or pending one as Final, however old', () => {
    const observedAt = 1_793_490_000_000
    const muchLater = observedAt + 24 * 60 * 60 * 1_000
    expect(
      observedActivityRow(account, record({ observedAt, status: 'Pending' }), {
        nowMs: muchLater,
      }).maybeFinality,
    ).toEqual(Option.some('Seen'))
    expect(
      observedActivityRow(account, record({ observedAt, status: 'Failed' }), {
        nowMs: muchLater,
      }).maybeFinality,
    ).toEqual(Option.some('Included'))
  })

  it('is refused on a network other than its account', () => {
    expect(() =>
      observedActivityRow(
        account,
        record({ networkId: 'solana:mainnet-beta' }),
        { nowMs: recordAtMs },
      ),
    ).toThrow()
  })
})

describe('the next row to write', () => {
  const included = observedActivityRow(account, record(), { nowMs: recordAtMs })

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
      { nowMs: 1 },
    )
    const next = nextActivityRow(Option.some(pending), included)
    expect(Option.map(next, row => row.status)).toEqual(
      Option.some('Confirmed'),
    )
    expect(Option.map(next, row => row.observedAtMs)).toEqual(Option.some(1))
  })

  it("keeps the address a sender recorded when the chain's record names none", () => {
    const sent: ActivityRow = {
      ...observedActivityRow(account, record({ status: 'Pending' }), {
        nowMs: recordAtMs,
      }),
      maybeFinality: Option.none(),
      maybeCounterpartyAddress: Option.some('Recipient111'),
    }
    const observed = observedActivityRow(
      account,
      record({ counterpartyAddress: '' }),
      { nowMs: recordAtMs },
    )
    expect(
      Option.map(
        nextActivityRow(Option.some(sent), observed),
        row => row.maybeCounterpartyAddress,
      ),
    ).toEqual(Option.some(Option.some('Recipient111')))
  })

  it('never moves a row back on a stale observation', () => {
    const pending = observedActivityRow(
      account,
      record({ status: 'Pending' }),
      { nowMs: recordAtMs },
    )
    expect(nextActivityRow(Option.some(included), pending)).toEqual(
      Option.none(),
    )
  })

  it('never changes a Final row', () => {
    const final: ActivityRow = {
      ...included,
      maybeFinality: Option.some('Final'),
    }
    const failed = observedActivityRow(account, record({ status: 'Failed' }), {
      nowMs: recordAtMs,
    })
    expect(nextActivityRow(Option.some(final), failed)).toEqual(Option.none())
    expect(nextActivityRow(Option.some(final), included)).toEqual(Option.none())
  })
})

describe('where the chain says a transaction stands', () => {
  const atMs = 1_793_490_000_000
  const included = observedActivityRow(account, record({ observedAt: atMs }), {
    nowMs: atMs,
  })
  const pending: ActivityRow = {
    ...included,
    status: 'Pending',
    maybeFinality: Option.none(),
    maybeConfirmedAtMs: Option.none(),
  }
  const final: ActivityRow = {
    ...included,
    maybeFinality: Option.some('Final'),
  }

  it('moves an included row to Final', () => {
    expect(settledActivityRow(included, 'Final', atMs)).toEqual(
      Option.some(final),
    )
  })

  it('confirms a pending row once it is in a block, or already final', () => {
    const confirmed = settledActivityRow(pending, 'Included', atMs + 5)
    expect(Option.map(confirmed, row => row.status)).toEqual(
      Option.some('Confirmed'),
    )
    expect(Option.map(confirmed, row => row.maybeFinality)).toEqual(
      Option.some(Option.some('Included')),
    )
    expect(Option.map(confirmed, row => row.maybeConfirmedAtMs)).toEqual(
      Option.some(Option.some(atMs + 5)),
    )
    expect(
      Option.map(settledActivityRow(pending, 'Final', atMs), row => row.status),
    ).toEqual(Option.some('Confirmed'))
  })

  it('writes nothing when nothing moved', () => {
    expect(settledActivityRow(included, 'Included', atMs)).toEqual(
      Option.none(),
    )
    expect(settledActivityRow(pending, 'Unknown', atMs)).toEqual(Option.none())
  })

  it('never changes a Final row, even if a provider has lost it', () => {
    for (const standing of [
      'Unknown',
      'Seen',
      'Included',
      'FailedOnChain',
      'Final',
    ] as const) {
      expect(settledActivityRow(final, standing, atMs)).toEqual(Option.none())
    }
  })

  it('sends a row back to Pending, finality cleared, when a reorg drops it', () => {
    const reorged = settledActivityRow(included, 'Unknown', atMs)
    expect(Option.map(reorged, row => row.status)).toEqual(
      Option.some('Pending'),
    )
    expect(Option.map(reorged, row => row.maybeFinality)).toEqual(
      Option.some(Option.none()),
    )
    expect(Option.map(reorged, row => row.maybeConfirmedAtMs)).toEqual(
      Option.some(Option.none()),
    )
  })

  it('fails a transaction that failed on the chain, and says so', () => {
    const failed = settledActivityRow(included, 'FailedOnChain', atMs)
    expect(Option.map(failed, row => row.status)).toEqual(Option.some('Failed'))
    expect(Option.flatMap(failed, row => row.maybeFailure)).toEqual(
      Option.some('It failed on the chain.'),
    )
  })

  it('fails a pending send that never landed, once its chain has given up', () => {
    const threeMinutes = 3 * 60 * 1_000
    expect(
      settledActivityRow(pending, 'Unknown', atMs + threeMinutes - 1),
    ).toEqual(Option.none())
    const expired = settledActivityRow(pending, 'Unknown', atMs + threeMinutes)
    expect(Option.map(expired, row => row.status)).toEqual(
      Option.some('Failed'),
    )
    expect(Option.flatMap(expired, row => row.maybeFailure)).toEqual(
      Option.some('It never landed, so nothing was sent.'),
    )
  })

  it('gives an Ethereum send an hour, since it can wait in the mempool', () => {
    const onEthereum: ActivityRow = {
      ...pending,
      networkId: 'ethereum:sepolia',
    }
    const hour = 60 * 60 * 1_000
    expect(settledActivityRow(onEthereum, 'Unknown', atMs + hour - 1)).toEqual(
      Option.none(),
    )
    expect(
      Option.map(
        settledActivityRow(onEthereum, 'Unknown', atMs + hour),
        row => row.status,
      ),
    ).toEqual(Option.some('Failed'))
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

describe('a send the page reported', () => {
  const sent = {
    networkId: 'solana:devnet',
    senderAddress: address,
    transactionId: '5hSignature',
    recipientAddress: 'Recipient1111',
    amountAtomic: '250000000',
  } as const

  it('starts Pending, under its account, with no finality yet', () => {
    expect(sentActivityRow(account.accountKey, sent, 7)).toEqual({
      transactionKey: `${account.accountKey}|5hSignature`,
      transactionId: '5hSignature',
      networkId: 'solana:devnet',
      direction: 'Outgoing',
      status: 'Pending',
      maybeFinality: Option.none(),
      assetId: 'solana:devnet:sol',
      amountAtomic: '250000000',
      maybeCounterpartyAddress: Option.some('Recipient1111'),
      observedAtMs: 7,
      maybeConfirmedAtMs: Option.none(),
      maybeFailure: Option.none(),
    })
  })

  it('is written to the asset of its own network, so test money stays test money', () => {
    expect(
      sentActivityRow(
        'holder|ethereum:mainnet|0xSender',
        { ...sent, networkId: 'ethereum:mainnet' },
        7,
      ).assetId,
    ).toBe('ethereum:mainnet:eth')
  })

  it('moves on when the chain confirms it, keeping its recipient', () => {
    const row = sentActivityRow(account.accountKey, sent, 7)
    const confirmed = observedActivityRow(
      account,
      record({
        direction: 'Outgoing',
        counterpartyAddress: '',
        normalizedCounterpartyAddress: '',
      }),
      { nowMs: recordAtMs },
    )
    expect(
      Option.map(nextActivityRow(Option.some(row), confirmed), next => ({
        status: next.status,
        observedAtMs: next.observedAtMs,
        recipient: next.maybeCounterpartyAddress,
      })),
    ).toEqual(
      Option.some({
        status: 'Confirmed',
        observedAtMs: 7,
        recipient: Option.some('Recipient1111'),
      }),
    )
  })
})

describe('how long a send has', () => {
  const pending = (networkId: WatchedNetworkId, observedAtMs: number) => ({
    ...sentActivityRow(
      `holder|${networkId}|Sender1111`,
      {
        networkId,
        senderAddress: 'Sender1111',
        transactionId: '5hSent',
        recipientAddress: 'Recipient1111',
        amountAtomic: '1',
      },
      observedAtMs,
    ),
  })

  it('is 3 minutes on Solana and an hour on Ethereum, from when it was seen', () => {
    expect(msUntilNeverLanded(pending('solana:devnet', 1_000), 1_000)).toEqual(
      Option.some(180_000),
    )
    expect(
      msUntilNeverLanded(pending('ethereum:sepolia', 1_000), 61_000),
    ).toEqual(Option.some(3_540_000))
  })

  it('has run out at zero, never below it', () => {
    expect(msUntilNeverLanded(pending('solana:devnet', 0), 900_000)).toEqual(
      Option.some(0),
    )
  })

  it('does not apply to a row the chain already took', () => {
    expect(
      msUntilNeverLanded(
        { ...pending('solana:devnet', 0), status: 'Confirmed' },
        0,
      ),
    ).toEqual(Option.none())
  })
})
