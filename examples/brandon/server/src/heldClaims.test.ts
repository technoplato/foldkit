import { Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { accountKeyOf } from './account.js'
import {
  type ClaimDependencies,
  type ClaimUpdate,
  type HeldListing,
  type SignerOutcome,
  RetryLater,
  Refused,
  Sent,
  claimUpdateOf,
  heldListingLineOf,
  heldListingsOf,
  makeClaimQueue,
  planClaim,
  retryDelayMs,
  runClaim,
  signerArgumentsOf,
  signerOutcomeOf,
} from './heldClaims.js'
import type { ClaimRecord, PersonAccount } from './store.js'

const holder = `brandon-dot:${accountKeyOf('recipient@example.com')}`
const otherHolder = `brandon-dot:${accountKeyOf('someone-else@example.com')}`
const mainnet = 'solana:mainnet-beta'
const heldAddress = 'So11111111111111111111111111111111111111112'
const ownAddress = '11111111111111111111111111111111'
const glowAddress = '9P5ZvpucqtaMqGD9LrwmxqZJvELKrehApri4GCCYt6f7'
const sendId = '6f9619ff-8b86-d011-b42d-00c04fc964ff'
const signature = '5'.repeat(88)

const claimOf = (fields: Partial<ClaimRecord> = {}): ClaimRecord => ({
  claimKey: `${holder}|${mainnet}|${heldAddress}|1000`,
  holder,
  networkId: mainnet,
  fromAddress: heldAddress,
  toAddress: ownAddress,
  sendId,
  requestedAtMs: 1000,
  status: 'Requested',
  maybeAmountAtomic: Option.none(),
  maybeTransactionId: Option.none(),
  maybeFailure: Option.none(),
  updatedAtMs: 1000,
  ...fields,
})

const listing: HeldListing = { networkId: mainnet, address: heldAddress, holder }

const accounts: ReadonlyArray<PersonAccount> = [
  { networkId: mainnet, address: heldAddress, isHeldByScribe: true },
  { networkId: mainnet, address: ownAddress, isHeldByScribe: false },
]

const sendAnswer = (fields: Readonly<Record<string, unknown>> = {}): string =>
  JSON.stringify({
    amount: { asset: 'SOL', baseUnits: '181066945', decimal: '0.181066945' },
    chain: 'solana',
    explorer: `https://explorer.solana.com/tx/${signature}`,
    from: heldAddress,
    id: sendId.toUpperCase(),
    network: mainnet,
    status: 'pending',
    to: ownAddress,
    transactionID: signature,
    ...fields,
  })

describe('the held list on this Mac', () => {
  it('reads one held account per line, and skips anything else', () => {
    const text = [
      heldListingLineOf(listing),
      '',
      '# a comment',
      `${mainnet}\t${glowAddress}`,
      `solana:devnet\t${heldAddress}\t${otherHolder}\textra`,
      `${mainnet} ${heldAddress} ${holder}`,
    ].join('\n')
    expect(heldListingsOf(text)).toEqual([listing])
  })

  it('writes a line it reads back', () => {
    expect(heldListingLineOf(listing)).toBe(`${mainnet}\t${heldAddress}\t${holder}`)
    expect(heldListingsOf(`${heldListingLineOf(listing)}\n`)).toEqual([listing])
  })
})

describe('what the worker checks before it signs', () => {
  it('pays a claim from an account this Mac lists for that person, to their own address', () => {
    expect(planClaim(claimOf(), [listing], accounts)._tag).toBe('PayClaim')
  })

  it("never pays from an account this Mac does not list for the claim's person", () => {
    const refusals = [
      planClaim(claimOf(), [], accounts),
      planClaim(claimOf(), [{ ...listing, holder: otherHolder }], accounts),
      planClaim(claimOf(), [{ ...listing, networkId: 'solana:devnet' }], accounts),
      planClaim(
        claimOf({ fromAddress: glowAddress }),
        [listing],
        [
          ...accounts,
          { networkId: mainnet, address: glowAddress, isHeldByScribe: true },
        ],
      ),
    ]
    for (const plan of refusals) {
      expect(plan._tag).toBe('RefuseClaim')
    }
  })

  it('never pays from an account the database does not mark as held', () => {
    const plan = planClaim(claimOf(), [listing], [
      { networkId: mainnet, address: heldAddress, isHeldByScribe: false },
      { networkId: mainnet, address: ownAddress, isHeldByScribe: false },
    ])
    expect(plan._tag).toBe('RefuseClaim')
  })

  it("never pays to an address that is not one of the person's own", () => {
    for (const toAddress of [glowAddress, heldAddress]) {
      expect(planClaim(claimOf({ toAddress }), [listing], accounts)._tag).toBe(
        'RefuseClaim',
      )
    }
    const heldDestination = planClaim(claimOf(), [listing], [
      { networkId: mainnet, address: heldAddress, isHeldByScribe: true },
      { networkId: mainnet, address: ownAddress, isHeldByScribe: true },
    ])
    expect(heldDestination._tag).toBe('RefuseClaim')
  })

  it('says why in words, and that nothing was signed', () => {
    const plan = planClaim(claimOf(), [], accounts)
    expect(plan._tag).toBe('RefuseClaim')
    if (plan._tag === 'RefuseClaim') {
      expect(plan.reason).toMatch(/nothing was signed/i)
      expect(plan.reason.length).toBeLessThanOrEqual(200)
    }
  })
})

describe('the send it asks the signer for', () => {
  it('is everything less the fee, from the held account, under the claim’s own send id', () => {
    expect(signerArgumentsOf(claimOf())).toEqual([
      'send',
      '--network',
      mainnet,
      '--from',
      heldAddress,
      '--to',
      ownAddress,
      '--all',
      '--id',
      sendId,
      '--json',
    ])
  })
})

describe('how a signer run ended', () => {
  const run = (
    fields: Partial<Parameters<typeof signerOutcomeOf>[0]>,
  ): SignerOutcome =>
    signerOutcomeOf(
      {
        maybeExitCode: Option.some(0),
        stdout: '',
        stderr: '',
        isTimedOut: false,
        ...fields,
      },
      claimOf(),
    )

  it('is Sent with the amount and transaction the signer printed', () => {
    expect(
      run({
        stdout: `${sendAnswer()}\n`,
        stderr: 'About to sign 0.181066945 SOL on Solana Mainnet Beta\n',
      }),
    ).toEqual(Sent({ amountAtomic: '181066945', transactionId: signature }))
  })

  it('matches its own send id whatever case the signer prints it in', () => {
    expect(run({ stdout: sendAnswer({ id: sendId }) })._tag).toBe('Sent')
    expect(run({ stdout: sendAnswer({ id: sendId.toUpperCase() }) })._tag).toBe(
      'Sent',
    )
  })

  it('takes a re-sent payment as the same one', () => {
    expect(
      run({
        stdout: sendAnswer({ status: 'final' }),
        stderr: `Send ${sendId.toUpperCase()} was signed before, so this sends its same signed bytes again: one id never pays twice.\n`,
      }),
    ).toEqual(Sent({ amountAtomic: '181066945', transactionId: signature }))
  })

  it('tries again, never Failed, when it cannot tell what the signer sent', () => {
    for (const stdout of [
      '',
      'not json',
      sendAnswer({ id: '00000000-0000-0000-0000-000000000000' }),
      sendAnswer({ from: glowAddress }),
      sendAnswer({ to: glowAddress }),
      sendAnswer({ amount: { asset: 'SOL', baseUnits: 'lots', decimal: '1' } }),
    ]) {
      expect(run({ stdout })._tag).toBe('RetryLater')
    }
  })

  it('is Failed with the signer’s own words when it refused or the send failed', () => {
    expect(
      run({
        maybeExitCode: Option.some(1),
        stderr:
          'About to sign 0.1 SOL\nRefused: the transfer cannot go: the balance, 0 SOL, is below the 0.000005 SOL it needs. Nothing was signed.\n',
      }),
    ).toEqual(
      Refused({
        reason:
          'Refused: the transfer cannot go: the balance, 0 SOL, is below the 0.000005 SOL it needs. Nothing was signed.',
      }),
    )
    expect(
      run({
        maybeExitCode: Option.some(1),
        stderr: `Failed: the send ${sendId.toUpperCase()} expired before it landed; nothing was sent.\n`,
      }),
    ).toEqual(
      Refused({
        reason: `Failed: the send ${sendId.toUpperCase()} expired before it landed; nothing was sent.`,
      }),
    )
  })

  it('tries again when only this Mac’s locked keychain stood in the way', () => {
    expect(
      run({
        maybeExitCode: Option.some(1),
        stderr:
          'Refused: The Keychain refused: reading solana:So111: User interaction is not allowed. (-25308)\n',
      })._tag,
    ).toBe('RetryLater')
  })

  it('tries again after a network failure, a timeout, or a signer that stopped early', () => {
    expect(
      run({
        maybeExitCode: Option.some(2),
        stderr: 'Network failure: the node did not answer within 5 seconds.\n',
      })._tag,
    ).toBe('RetryLater')
    expect(run({ maybeExitCode: Option.none(), isTimedOut: true })._tag).toBe(
      'RetryLater',
    )
    expect(run({ maybeExitCode: Option.none() })._tag).toBe('RetryLater')
  })

  it('is Failed when the signer could not read its command', () => {
    expect(
      run({
        maybeExitCode: Option.some(64),
        stderr: "Error: Unknown option '--all'\n",
      })._tag,
    ).toBe('Refused')
  })

  it('keeps a reason to the 200 characters a claim holds', () => {
    const outcome = run({
      maybeExitCode: Option.some(1),
      stderr: `Refused: ${'x'.repeat(400)}\n`,
    })
    expect(outcome._tag).toBe('Refused')
    if (outcome._tag === 'Refused') {
      expect(outcome.reason.length).toBe(200)
    }
  })
})

describe('what a claim becomes', () => {
  it('is Sent with its amount and transaction, Failed with words, or left Requested', () => {
    expect(
      claimUpdateOf(Sent({ amountAtomic: '5', transactionId: signature }), 7),
    ).toEqual(
      Option.some({
        status: 'Sent',
        maybeAmountAtomic: Option.some('5'),
        maybeTransactionId: Option.some(signature),
        maybeFailure: Option.none(),
        updatedAtMs: 7,
      }),
    )
    expect(claimUpdateOf(Refused({ reason: 'Refused: no.' }), 7)).toEqual(
      Option.some({
        status: 'Failed',
        maybeAmountAtomic: Option.none(),
        maybeTransactionId: Option.none(),
        maybeFailure: Option.some('Refused: no.'),
        updatedAtMs: 7,
      }),
    )
    expect(claimUpdateOf(RetryLater({ reason: 'later' }), 7)).toEqual(
      Option.none(),
    )
  })
})

describe('one claim, run', () => {
  const dependencies = (
    fields: Partial<ClaimDependencies> = {},
  ): Readonly<{
    dependencies: ClaimDependencies
    finished: Array<Readonly<{ claim: ClaimRecord; update: ClaimUpdate }>>
    signed: Array<ClaimRecord>
  }> => {
    const finished: Array<Readonly<{ claim: ClaimRecord; update: ClaimUpdate }>> =
      []
    const signed: Array<ClaimRecord> = []
    return {
      finished,
      signed,
      dependencies: {
        readListings: Effect.succeed([listing]),
        personAccounts: () => Effect.succeed(accounts),
        sign: claim =>
          Effect.sync(() => {
            signed.push(claim)
            return Sent({ amountAtomic: '181066945', transactionId: signature })
          }),
        finishClaim: (claim, update) =>
          Effect.sync(() => {
            finished.push({ claim, update })
          }),
        nowMs: Effect.succeed(5000),
        ...fields,
      },
    }
  }

  it('signs once and writes Sent', async () => {
    const { dependencies: deps, finished, signed } = dependencies()
    const run = await Effect.runPromise(runClaim(claimOf(), deps))
    expect(run).toEqual({ _tag: 'PaidClaim', transactionId: signature })
    expect(signed.length).toBe(1)
    expect(finished.map(({ update }) => update.status)).toEqual(['Sent'])
  })

  it('signs nothing for a claim the checks refuse, and writes Failed', async () => {
    const { dependencies: deps, finished, signed } = dependencies({
      readListings: Effect.succeed([]),
    })
    const run = await Effect.runPromise(runClaim(claimOf(), deps))
    expect(run._tag).toBe('RefusedClaim')
    expect(signed).toEqual([])
    expect(finished.map(({ update }) => update.status)).toEqual(['Failed'])
  })

  it('leaves the claim Requested when the held list cannot be read', async () => {
    const { dependencies: deps, finished, signed } = dependencies({
      readListings: Effect.fail(new Error('no such file')),
    })
    const run = await Effect.runPromise(runClaim(claimOf(), deps))
    expect(run._tag).toBe('WillRetryClaim')
    expect(signed).toEqual([])
    expect(finished).toEqual([])
  })

  it('leaves the claim Requested when the signer must try again', async () => {
    const { dependencies: deps, finished } = dependencies({
      sign: () =>
        Effect.succeed(RetryLater({ reason: 'Network failure: no answer.' })),
    })
    const run = await Effect.runPromise(runClaim(claimOf(), deps))
    expect(run._tag).toBe('WillRetryClaim')
    expect(finished).toEqual([])
  })

  it('tries again, never Failed, when Sent could not be written', async () => {
    const { dependencies: deps } = dependencies({
      finishClaim: () => Effect.fail(new Error('Instant did not answer')),
    })
    const run = await Effect.runPromise(runClaim(claimOf(), deps))
    expect(run._tag).toBe('WillRetryClaim')
  })
})

describe('the claims waiting on this Mac', () => {
  it('takes the oldest claim first, and each one once while it runs', () => {
    const queue = makeClaimQueue()
    const older = claimOf({ claimKey: 'older', requestedAtMs: 1 })
    const newer = claimOf({ claimKey: 'newer', requestedAtMs: 2 })
    queue.offer([newer, older])
    expect(Option.map(queue.takeDue(10), ({ claimKey }) => claimKey)).toEqual(
      Option.some('older'),
    )
    expect(Option.map(queue.takeDue(10), ({ claimKey }) => claimKey)).toEqual(
      Option.some('newer'),
    )
    expect(queue.takeDue(10)).toEqual(Option.none())
  })

  it('waits longer each time a claim must be tried again', () => {
    const queue = makeClaimQueue()
    queue.offer([claimOf()])
    Option.getOrThrow(queue.takeDue(0))
    queue.settle(claimOf().claimKey, 'WillRetryClaim', 0)
    expect(queue.takeDue(retryDelayMs(0) - 1)).toEqual(Option.none())
    Option.getOrThrow(queue.takeDue(retryDelayMs(0)))
    queue.settle(claimOf().claimKey, 'WillRetryClaim', retryDelayMs(0))
    expect(queue.takeDue(retryDelayMs(0) + retryDelayMs(1) - 1)).toEqual(
      Option.none(),
    )
    expect(Option.isSome(queue.takeDue(retryDelayMs(0) + retryDelayMs(1)))).toBe(
      true,
    )
  })

  it('never takes a claim again once it is paid or refused, whatever a late list says', () => {
    const queue = makeClaimQueue()
    queue.offer([claimOf()])
    Option.getOrThrow(queue.takeDue(0))
    queue.settle(claimOf().claimKey, 'PaidClaim', 0)
    queue.offer([claimOf()])
    expect(queue.takeDue(1_000_000)).toEqual(Option.none())
  })

  it('forgets a claim the list no longer holds', () => {
    const queue = makeClaimQueue()
    queue.offer([claimOf()])
    queue.offer([])
    expect(queue.takeDue(0)).toEqual(Option.none())
  })

  it('backs off to at most ten minutes', () => {
    expect(retryDelayMs(0)).toBe(30_000)
    expect(retryDelayMs(1)).toBe(60_000)
    expect(retryDelayMs(30)).toBe(600_000)
  })
})
