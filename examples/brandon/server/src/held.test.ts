import {
  HeldAccounts,
  type SentTransaction,
  sentTransactionPathOf,
} from 'brandon-core-example'
import { Array, Effect, Option, Schema as S } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'

import { accountKeyOf } from './account.js'
import { handle } from './handler.js'
import type { BrandonStore, ClaimRecord, PersonAccount } from './store.js'
import { signedLogin, testVerifier } from './testAccess.js'

const recipient = 'recipient@example.com'
const michael = 'michael@example.com'
const emptyHanded = 'empty-handed@example.com'
const guest = 'guest@example.com'

const holderOf = (email: string): string => `brandon-dot:${accountKeyOf(email)}`

const flagsFor: Readonly<Record<string, ReadonlyArray<string>>> = {
  [accountKeyOf(recipient)]: ['party', 'wallet'],
  [accountKeyOf(michael)]: ['party', 'wallets', 'wallet'],
  [accountKeyOf(emptyHanded)]: ['party', 'wallet'],
  [accountKeyOf(guest)]: ['party'],
}

const heldAddress = 'So11111111111111111111111111111111111111112'
const ownAddress = '11111111111111111111111111111111'
const michaelsHeldAddress = 'Vote111111111111111111111111111111111111111'
const strangerAddress = 'Stake11111111111111111111111111111111111111'
const ethereumAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

const mainnet = 'solana:mainnet-beta'

const heldBalanceAtomic = '181071945'

const personAccounts: ReadonlyArray<
  Readonly<{ holder: string; account: PersonAccount }>
> = [
  {
    holder: holderOf(recipient),
    account: { networkId: mainnet, address: heldAddress, isHeldByScribe: true },
  },
  {
    holder: holderOf(recipient),
    account: { networkId: mainnet, address: ownAddress, isHeldByScribe: false },
  },
  {
    holder: holderOf(michael),
    account: {
      networkId: mainnet,
      address: michaelsHeldAddress,
      isHeldByScribe: true,
    },
  },
]

const claimOf = (fields: Partial<ClaimRecord> = {}): ClaimRecord => ({
  claimKey: `${holderOf(recipient)}|${mainnet}|${heldAddress}|1`,
  holder: holderOf(recipient),
  networkId: mainnet,
  fromAddress: heldAddress,
  toAddress: ownAddress,
  sendId: '6F9619FF-8B86-D011-B42D-00C04FC964FF',
  requestedAtMs: 1,
  status: 'Failed',
  maybeAmountAtomic: Option.none(),
  maybeTransactionId: Option.none(),
  maybeFailure: Option.some('It never landed, so nothing was sent.'),
  updatedAtMs: 1,
  ...fields,
})

const filed: Array<ClaimRecord> = []
const reportedSends: Array<SentTransaction> = []
const balanceAnswers = new Map<string, Option.Option<`${bigint}`>>()

const store: BrandonStore = {
  account: key =>
    Effect.succeed(
      Option.map(Option.fromNullishOr(flagsFor[key]), flags => ({
        displayName: 'Someone',
        flags,
      })),
    ),
  sections: Effect.succeed([]),
  wallets: Effect.succeed([]),
  walletActivity: () => Effect.succeed([]),
  watchedAccountKeys: holder =>
    Effect.succeed(
      Array.filterMap(personAccounts, entry =>
        entry.holder === holder
          ? Option.some(
              `${holder}|${entry.account.networkId}|${entry.account.address}`,
            )
          : Option.none(),
      ),
    ),
  addWatchedAccount: () => Effect.void,
  addSentTransaction: (_holder, sent) =>
    Effect.sync(() => {
      reportedSends.push(sent)
    }),
  personAccounts: holder =>
    Effect.succeed(
      Array.filterMap(personAccounts, entry =>
        entry.holder === holder
          ? Option.some(entry.account)
          : Option.none(),
      ),
    ),
  claims: holder =>
    Effect.succeed(Array.filter(filed, claim => claim.holder === holder)),
  addClaim: claim =>
    Effect.sync(() => {
      filed.push(claim)
    }),
}

const request = (
  method: string,
  path: string,
  maybeEmail: Option.Option<string>,
): ReturnType<typeof handle> =>
  handle(
    {
      method,
      path,
      headers: {
        host: 'page.example.com',
        ...Option.match(maybeEmail, {
          onNone: () => ({}),
          onSome: email => ({ 'cf-access-jwt-assertion': signedLogin(email) }),
        }),
      },
      remoteAddress: '127.0.0.1',
    },
    {
      verifier: testVerifier,
      store,
      football: Effect.succeed([]),
      loopbackEmail: Option.none(),
      heldBalance: ({ address }) =>
        Effect.succeed(
          Option.getOrElse(Option.fromNullishOr(balanceAnswers.get(address)), () =>
            Option.none(),
          ),
        ),
    },
  )

const get = (path: string, email: string) =>
  request('GET', path, Option.some(email))

const put = (path: string, email: string) =>
  request('PUT', path, Option.some(email))

const heldFor = async (email: string, path = '/api/wallet/held') =>
  S.decodeUnknownSync(HeldAccounts)(
    JSON.parse((await get(path, email)).body.toString()),
  )

const claimPathOf = (networkId: string, held: string, to: string): string =>
  `/api/wallet/claim/${encodeURIComponent(networkId)}/${encodeURIComponent(held)}/${encodeURIComponent(to)}`

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

beforeEach(() => {
  filed.length = 0
  reportedSends.length = 0
  balanceAnswers.clear()
  balanceAnswers.set(heldAddress, Option.some(heldBalanceAtomic))
})

describe('money Scribe holds for a person', () => {
  it('lists only their own held accounts, with the balance the chain reports and the newest claim', async () => {
    filed.push(
      claimOf(),
      claimOf({
        claimKey: `${holderOf(recipient)}|${mainnet}|${heldAddress}|2`,
        requestedAtMs: 2,
        status: 'Requested',
        maybeFailure: Option.none(),
        updatedAtMs: 2,
      }),
    )
    expect(await heldFor(recipient)).toEqual([
      {
        networkId: mainnet,
        address: heldAddress,
        maybeBalanceAtomic: Option.some(heldBalanceAtomic),
        maybeClaim: Option.some({
          toAddress: ownAddress,
          requestedAtMs: 2,
          status: 'Requested',
          maybeAmountAtomic: Option.none(),
          maybeTransactionId: Option.none(),
          maybeFailure: Option.none(),
        }),
      },
    ])
  })

  it('names a sent claim with its amount and transaction', async () => {
    filed.push(
      claimOf({
        status: 'Sent',
        maybeAmountAtomic: Option.some('181066945'),
        maybeTransactionId: Option.some('5'.repeat(88)),
        maybeFailure: Option.none(),
      }),
    )
    const [held] = await heldFor(recipient)
    expect(held?.maybeClaim).toEqual(
      Option.some({
        toAddress: ownAddress,
        requestedAtMs: 1,
        status: 'Sent',
        maybeAmountAtomic: Option.some('181066945'),
        maybeTransactionId: Option.some('5'.repeat(88)),
        maybeFailure: Option.none(),
      }),
    )
  })

  it('says nothing of a balance the chain did not answer', async () => {
    balanceAnswers.clear()
    const [held] = await heldFor(recipient)
    expect(held?.maybeBalanceAtomic).toEqual(Option.none())
    expect(held?.maybeClaim).toEqual(Option.none())
  })

  it('is an empty list for someone Scribe holds nothing for', async () => {
    expect(await heldFor(emptyHanded)).toEqual([])
  })

  it('reaches only the signed-in person, whatever the request asks for', async () => {
    expect(
      Array.map(
        await heldFor(recipient, `/api/wallet/held?holder=${holderOf(michael)}`),
        ({ address }) => address,
      ),
    ).toEqual([heldAddress])
    expect(
      Array.map(await heldFor(michael), ({ address }) => address),
    ).toEqual([michaelsHeldAddress])
  })

  it('is refused without the wallet flag or a login', async () => {
    expect((await get('/api/wallet/held', guest)).status).toBe(403)
    expect(
      (await request('GET', '/api/wallet/held', Option.none())).status,
    ).toBe(403)
  })
})

describe('moving held money to their own wallet', () => {
  it('files a claim for their own held account, to an address their own wallet registered', async () => {
    const before = Date.now()
    const answer = await put(
      claimPathOf(mainnet, heldAddress, ownAddress),
      recipient,
    )
    expect(answer.status).toBe(200)
    expect(filed.length).toBe(1)
    const [claim] = filed
    expect(claim?.holder).toBe(holderOf(recipient))
    expect(claim?.networkId).toBe(mainnet)
    expect(claim?.fromAddress).toBe(heldAddress)
    expect(claim?.toAddress).toBe(ownAddress)
    expect(claim?.status).toBe('Requested')
    expect(claim?.sendId).toMatch(uuidPattern)
    expect(claim?.requestedAtMs).toBeGreaterThanOrEqual(before)
    expect(claim?.claimKey).toBe(
      `${holderOf(recipient)}|${mainnet}|${heldAddress}|${String(claim?.requestedAtMs)}`,
    )
    expect(claim?.maybeAmountAtomic).toEqual(Option.none())
    expect(claim?.maybeTransactionId).toEqual(Option.none())
    expect(claim?.maybeFailure).toEqual(Option.none())
  })

  it('gives every claim its own send id', async () => {
    await put(claimPathOf(mainnet, heldAddress, ownAddress), recipient)
    filed.splice(0, 1, { ...Option.getOrThrow(Array.head(filed)), status: 'Failed' })
    await put(claimPathOf(mainnet, heldAddress, ownAddress), recipient)
    expect(filed.length).toBe(2)
    expect(filed[0]?.sendId).not.toBe(filed[1]?.sendId)
  })

  it('files nothing more while a claim is still on its way', async () => {
    filed.push(claimOf({ status: 'Requested', maybeFailure: Option.none() }))
    const answer = await put(
      claimPathOf(mainnet, heldAddress, ownAddress),
      recipient,
    )
    expect(answer.status).toBe(200)
    expect(filed.length).toBe(1)
  })

  it('files a new claim once the last one failed or was sent', async () => {
    filed.push(claimOf())
    await put(claimPathOf(mainnet, heldAddress, ownAddress), recipient)
    expect(filed.length).toBe(2)
    expect(filed[1]?.status).toBe('Requested')
  })

  it('refuses an account Scribe does not hold for them', async () => {
    for (const notTheirs of [michaelsHeldAddress, ownAddress, strangerAddress]) {
      const answer = await put(
        claimPathOf(mainnet, notTheirs, ownAddress),
        recipient,
      )
      expect(answer.status).toBe(403)
    }
    expect(filed).toEqual([])
  })

  it('refuses an address their own wallet did not register, or one Scribe holds', async () => {
    for (const notTheirOwn of [strangerAddress, michaelsHeldAddress]) {
      const answer = await put(
        claimPathOf(mainnet, heldAddress, notTheirOwn),
        recipient,
      )
      expect(answer.status).toBe(403)
    }
    expect(filed).toEqual([])
  })

  it('refuses to move money to the account it is already in', async () => {
    const answer = await put(
      claimPathOf(mainnet, heldAddress, heldAddress),
      recipient,
    )
    expect(answer.status).toBe(400)
    expect(filed).toEqual([])
  })

  it('never moves money on another network than the one Scribe holds it on', async () => {
    const answer = await put(
      claimPathOf('solana:devnet', heldAddress, ownAddress),
      recipient,
    )
    expect(answer.status).toBe(403)
    expect(filed).toEqual([])
  })

  it('takes only public addresses on one of the four networks', async () => {
    for (const path of [
      claimPathOf('solana:testnet', heldAddress, ownAddress),
      claimPathOf('bitcoin:mainnet', heldAddress, ownAddress),
      claimPathOf(mainnet, ethereumAddress, ownAddress),
      claimPathOf(mainnet, heldAddress, 'not-an-address'),
      claimPathOf(mainnet, `${heldAddress}|holder`, ownAddress),
      claimPathOf('ethereum:mainnet', heldAddress, ownAddress),
    ]) {
      expect((await put(path, recipient)).status).toBe(400)
    }
    expect(filed).toEqual([])
  })

  it('is refused without the wallet flag or a login', async () => {
    const path = claimPathOf(mainnet, heldAddress, ownAddress)
    expect((await put(path, guest)).status).toBe(403)
    expect((await request('PUT', path, Option.none())).status).toBe(403)
    expect(filed).toEqual([])
  })

  it('answers only PUT, and no shorter or longer path', async () => {
    const path = claimPathOf(mainnet, heldAddress, ownAddress)
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      expect((await request(method, path, Option.some(recipient))).status).toBe(
        405,
      )
    }
    for (const shapeless of [
      '/api/wallet/claim',
      `/api/wallet/claim/${encodeURIComponent(mainnet)}/${heldAddress}`,
      `${path}/more`,
      '/api/wallet/held',
    ]) {
      expect((await put(shapeless, recipient)).status).toBe(405)
    }
    expect(filed).toEqual([])
  })
})

describe('a send the page reports from a held account', () => {
  it('is refused: only Scribe sends from an account it holds', async () => {
    const sent: SentTransaction = {
      networkId: mainnet,
      senderAddress: heldAddress,
      transactionId: '5'.repeat(88),
      recipientAddress: ownAddress,
      amountAtomic: '1000',
    }
    expect((await put(sentTransactionPathOf(sent), recipient)).status).toBe(403)
    expect(reportedSends).toEqual([])
  })

  it('still goes through from their own account', async () => {
    const sent: SentTransaction = {
      networkId: mainnet,
      senderAddress: ownAddress,
      transactionId: '5'.repeat(88),
      recipientAddress: heldAddress,
      amountAtomic: '1000',
    }
    expect((await put(sentTransactionPathOf(sent), recipient)).status).toBe(200)
    expect(reportedSends).toEqual([sent])
  })
})
