import {
  Array,
  Effect,
  Match as M,
  Option,
  Order,
  Result,
  Schema as S,
} from 'effect'
import { ts } from 'foldkit/schema'
import { AtomicUnits } from 'wallet-core-example'

import type { ClaimRecord, PersonAccount } from './store.js'

// HELD CLAIMS

/**
 * The claims worker's core: the checks before it signs, the send it asks
 * `scribe-wallet` for, what each way a send can end means for the claim,
 * and the order claims wait in. It runs on Michael's Mac, where the held
 * keys are, and no code here touches a key: `scribe-wallet` signs.
 */

/** The longest reason a claim keeps, as the `walletClaims` schema allows. */
export const failureWordsLimit = 200

const ellipsis = '…'

/** Words cut to what a claim keeps: `failure` holds at most 200 characters. */
export const withinFailureLimit = (words: string): string =>
  words.length <= failureWordsLimit
    ? words
    : `${words.slice(0, failureWordsLimit - ellipsis.length)}${ellipsis}`

const shownAddressCharacters = 6

/** An address as the worker's words and logs show it: `43T9sv…`. */
export const shortenedAddress = (address: string): string =>
  `${address.slice(0, shownAddressCharacters)}…`

// HELD LIST

/** One line of this Mac's held list: an account Scribe holds here, on one network, for one person. */
export type HeldListing = Readonly<{
  networkId: string
  address: string
  holder: string
}>

const listingFields = 3

/**
 * The held list's lines: `<networkId>\t<address>\t<holder>`. A line of any
 * other shape is left out, so it can never let the worker pay.
 */
export const heldListingsOf = (text: string): ReadonlyArray<HeldListing> =>
  Array.filterMap(text.split('\n'), line => {
    const fields = line.split('\t')
    const [networkId = '', address = '', holder = ''] = fields
    return fields.length === listingFields &&
      networkId !== '' &&
      address !== '' &&
      holder !== ''
      ? Result.succeed({ networkId, address, holder })
      : Result.failVoid
  })

/** A held list line for one account. */
export const heldListingLineOf = ({
  networkId,
  address,
  holder,
}: HeldListing): string => `${networkId}\t${address}\t${holder}`

// PLAN

/** Every check passed: ask the signer for the send. */
export const PayClaim = ts('PayClaim')
/** A check failed: nothing is signed, and the claim fails with these words. */
export const RefuseClaim = ts('RefuseClaim', { reason: S.String })
/** What the worker does with one claim before it signs anything. */
export const ClaimPlan = S.Union([PayClaim, RefuseClaim])
/** What the worker does with one claim before it signs anything. */
export type ClaimPlan = typeof ClaimPlan.Type

const isAt = (
  account: Readonly<{ networkId: string; address: string }>,
  networkId: string,
  address: string,
): boolean => account.networkId === networkId && account.address === address

/**
 * The checks before a claim is signed. The money moves only from an
 * account this Mac's held list names for the claim's own person on that
 * network, which the database also marks as held, and only to an address
 * of that person's own wallet on the same network. A row in the database
 * alone never makes it spend from another key of this Mac.
 */
export const planClaim = (
  claim: ClaimRecord,
  listings: ReadonlyArray<HeldListing>,
  accounts: ReadonlyArray<PersonAccount>,
): ClaimPlan => {
  const from = shortenedAddress(claim.fromAddress)
  const to = shortenedAddress(claim.toAddress)
  const isListed = Array.some(
    listings,
    listing =>
      listing.holder === claim.holder &&
      isAt(listing, claim.networkId, claim.fromAddress),
  )
  const isHeld = Array.some(
    accounts,
    account =>
      account.isHeldByScribe &&
      isAt(account, claim.networkId, claim.fromAddress),
  )
  const isTheirOwn = Array.some(
    accounts,
    account =>
      !account.isHeldByScribe &&
      isAt(account, claim.networkId, claim.toAddress),
  )
  if (!isListed) {
    return RefuseClaim({
      reason: withinFailureLimit(
        `This Mac lists no account it holds for this person at ${from} on ${claim.networkId}, so nothing was signed.`,
      ),
    })
  } else if (!isHeld) {
    return RefuseClaim({
      reason: withinFailureLimit(
        `Scribe's records do not show ${from} as an account it holds for this person, so nothing was signed.`,
      ),
    })
  } else if (!isTheirOwn || claim.toAddress === claim.fromAddress) {
    return RefuseClaim({
      reason: withinFailureLimit(
        `${to} is not an address this person's own wallet registered on ${claim.networkId}, so nothing was signed.`,
      ),
    })
  } else {
    return PayClaim()
  }
}

// SIGNER

/**
 * The send the worker asks `scribe-wallet` for: everything the held
 * account has, less the fee, under the claim's own send id, so a retry
 * re-sends the same signed bytes and never pays twice.
 */
export const signerArgumentsOf = (claim: ClaimRecord): ReadonlyArray<string> => [
  'send',
  '--network',
  claim.networkId,
  '--from',
  claim.fromAddress,
  '--to',
  claim.toAddress,
  '--all',
  '--id',
  claim.sendId,
  '--json',
]

/** The signer sent it: what it moved, and the transaction. */
export const Sent = ts('Sent', {
  amountAtomic: AtomicUnits,
  transactionId: S.String,
})
/**
 * The signer broadcast the send and the chain has not included it yet:
 * the claim stays Requested, and the same send id asks again soon. A
 * Solana send can still expire unlanded, so this is never Sent.
 */
export const Confirming = ts('Confirming', { transactionId: S.String })
/** The signer refused, or the send failed with nothing sent: the claim fails in these words. */
export const Refused = ts('Refused', { reason: S.String })
/** Nothing is known to have failed: the claim stays Requested and runs again later. */
export const RetryLater = ts('RetryLater', { reason: S.String })
/** How a signer run ended, for the claim. */
export const SignerOutcome = S.Union([Sent, Confirming, Refused, RetryLater])
/** How a signer run ended, for the claim. */
export type SignerOutcome = typeof SignerOutcome.Type

/** One signer run as the process ended it. No exit code: it was stopped, or never started. */
export type SignerRun = Readonly<{
  maybeExitCode: Option.Option<number>
  stdout: string
  stderr: string
  isTimedOut: boolean
}>

const SendAnswer = S.Struct({
  amount: S.Struct({ baseUnits: AtomicUnits }),
  from: S.String,
  id: S.String,
  status: S.String,
  to: S.String,
  transactionID: S.String,
})

/** The statuses that mean the chain has the send in a block. */
const includedStatuses: ReadonlyArray<string> = ['included', 'final']
/** The statuses that mean the send is broadcast and not in a block yet. */
const confirmingStatuses: ReadonlyArray<string> = ['pending', 'seen']

const doneExitCode = 0
const refusedExitCode = 1
const networkFailureExitCode = 2
const usageExitCode = 64

const reasonPrefixes = ['Refused:', 'Failed:', 'Network failure:']

/** The words that say a locked or unreadable keychain on this Mac stood in the way: that passes, the claim does not fail. */
const keychainSigns = ['The Keychain refused', '-25308']

const linesOf = (text: string): ReadonlyArray<string> =>
  Array.filter(
    Array.map(text.split('\n'), line => line.trim()),
    line => line !== '',
  )

const reasonOf = (stderr: string, otherwise: string): string => {
  const lines = linesOf(stderr)
  return Option.getOrElse(
    Option.orElse(
      Array.findLast(lines, line =>
        Array.some(reasonPrefixes, prefix => line.startsWith(prefix)),
      ),
      () => Array.last(lines),
    ),
    () => otherwise,
  )
}

const parseJson = Option.liftThrowable((line: string): unknown =>
  JSON.parse(line),
)

const decodeAnswer = (
  line: string,
): Option.Option<typeof SendAnswer.Type> =>
  Option.flatMap(parseJson(line), S.decodeUnknownOption(SendAnswer))

const answerOf = (stdout: string): Option.Option<typeof SendAnswer.Type> =>
  Option.flatMap(
    Array.findFirst(Array.reverse(linesOf(stdout)), line =>
      Option.isSome(decodeAnswer(line)),
    ),
    decodeAnswer,
  )

const isThisClaimsSend = (
  answer: typeof SendAnswer.Type,
  claim: ClaimRecord,
): boolean =>
  answer.id.toLowerCase() === claim.sendId.toLowerCase() &&
  answer.from === claim.fromAddress &&
  answer.to === claim.toAddress &&
  BigInt(answer.amount.baseUnits) > 0n

const sentOrRetry = (stdout: string, claim: ClaimRecord): SignerOutcome =>
  Option.match(answerOf(stdout), {
    onNone: () =>
      RetryLater({
        reason:
          'The signer said it sent the claim but printed no answer that could be read; the same send id finishes it.',
      }),
    onSome: answer => {
      if (!isThisClaimsSend(answer, claim)) {
        return RetryLater({
          reason:
            'The signer answered for another send than this claim; the same send id finishes it.',
        })
      } else if (Array.contains(includedStatuses, answer.status)) {
        return Sent({
          amountAtomic: answer.amount.baseUnits,
          transactionId: answer.transactionID,
        })
      } else if (Array.contains(confirmingStatuses, answer.status)) {
        return Confirming({ transactionId: answer.transactionID })
      } else {
        return RetryLater({
          reason: withinFailureLimit(
            `The signer said the send is ${answer.status}, which the worker has no word for; the same send id finishes it.`,
          ),
        })
      }
    },
  })

const refusedOrRetry = (stderr: string): SignerOutcome => {
  const reason = withinFailureLimit(
    reasonOf(stderr, 'The signer refused without saying why.'),
  )
  return Array.some(keychainSigns, sign => reason.includes(sign))
    ? RetryLater({ reason })
    : Refused({ reason })
}

/**
 * What one signer run means for its claim. Sent only on an answer that
 * names this claim's send id (in any case), its addresses, an amount and
 * a status the chain has in a block, included or final; pending or seen
 * waits for the chain. Failed only when the signer refused or the send
 * failed, which means nothing was sent. Everything else, a network
 * failure, a timeout, a locked keychain, an answer that cannot be read,
 * tries again later under the same send id, which re-sends the same
 * signed bytes and never pays twice.
 */
export const signerOutcomeOf = (
  run: SignerRun,
  claim: ClaimRecord,
): SignerOutcome => {
  if (run.isTimedOut) {
    return RetryLater({
      reason:
        'The signer did not finish in time and was stopped; the same send id finishes it.',
    })
  }
  return Option.match(run.maybeExitCode, {
    onNone: () =>
      RetryLater({
        reason: withinFailureLimit(
          reasonOf(
            run.stderr,
            'The signer stopped before it said how the send ended; the same send id finishes it.',
          ),
        ),
      }),
    onSome: exitCode =>
      M.value(exitCode).pipe(
        M.withReturnType<SignerOutcome>(),
        M.when(doneExitCode, () => sentOrRetry(run.stdout, claim)),
        M.when(refusedExitCode, () => refusedOrRetry(run.stderr)),
        M.when(networkFailureExitCode, () =>
          RetryLater({
            reason: withinFailureLimit(
              reasonOf(run.stderr, 'Network failure: the signer gave no reason.'),
            ),
          }),
        ),
        M.when(usageExitCode, () =>
          Refused({
            reason: withinFailureLimit(
              `The signer could not read its command: ${reasonOf(run.stderr, 'no reason given')}`,
            ),
          }),
        ),
        M.orElse(() =>
          RetryLater({
            reason: withinFailureLimit(
              `The signer ended with status ${exitCode.toString()}: ${reasonOf(run.stderr, 'no reason given')}`,
            ),
          }),
        ),
      ),
  })
}

// CLAIM

/** How a claim ended, as the worker writes it: Sent or Failed. */
export type ClaimUpdate = Readonly<{
  status: 'Sent' | 'Failed'
  maybeAmountAtomic: Option.Option<AtomicUnits>
  maybeTransactionId: Option.Option<string>
  maybeFailure: Option.Option<string>
  updatedAtMs: number
}>

const failedUpdate = (reason: string, nowMs: number): ClaimUpdate => ({
  status: 'Failed',
  maybeAmountAtomic: Option.none(),
  maybeTransactionId: Option.none(),
  maybeFailure: Option.some(withinFailureLimit(reason)),
  updatedAtMs: nowMs,
})

/** What a claim becomes after a signer run: Sent, Failed, or none to leave it Requested. */
export const claimUpdateOf = (
  outcome: SignerOutcome,
  nowMs: number,
): Option.Option<ClaimUpdate> =>
  M.value(outcome).pipe(
    M.withReturnType<Option.Option<ClaimUpdate>>(),
    M.tagsExhaustive({
      Sent: ({ amountAtomic, transactionId }) =>
        Option.some({
          status: 'Sent',
          maybeAmountAtomic: Option.some(amountAtomic),
          maybeTransactionId: Option.some(transactionId),
          maybeFailure: Option.none(),
          updatedAtMs: nowMs,
        }),
      Confirming: () => Option.none(),
      Refused: ({ reason }) => Option.some(failedUpdate(reason, nowMs)),
      RetryLater: () => Option.none(),
    }),
  )

/** The claim was paid out. */
export const PaidClaim = ts('PaidClaim', { transactionId: S.String })
/** The claim failed with nothing sent. */
export const RefusedClaim = ts('RefusedClaim', { reason: S.String })
/** The claim's send is broadcast; it stays Requested until the chain includes it. */
export const ConfirmingClaim = ts('ConfirmingClaim', { transactionId: S.String })
/** The claim stays Requested and runs again later. */
export const WillRetryClaim = ts('WillRetryClaim', { reason: S.String })
/** How one run of one claim ended. */
export const ClaimRun = S.Union([
  PaidClaim,
  ConfirmingClaim,
  RefusedClaim,
  WillRetryClaim,
])
/** How one run of one claim ended. */
export type ClaimRun = typeof ClaimRun.Type

/** What running a claim reads and writes. */
export type ClaimDependencies = Readonly<{
  readListings: Effect.Effect<ReadonlyArray<HeldListing>, Error>
  personAccounts: (
    holder: string,
  ) => Effect.Effect<ReadonlyArray<PersonAccount>, Error>
  sign: (claim: ClaimRecord) => Effect.Effect<SignerOutcome>
  finishClaim: (
    claim: ClaimRecord,
    update: ClaimUpdate,
  ) => Effect.Effect<void, Error>
  nowMs: Effect.Effect<number>
}>

const runOfOutcome = (outcome: SignerOutcome): ClaimRun =>
  M.value(outcome).pipe(
    M.withReturnType<ClaimRun>(),
    M.tagsExhaustive({
      Sent: ({ transactionId }) => PaidClaim({ transactionId }),
      Confirming: ({ transactionId }) => ConfirmingClaim({ transactionId }),
      Refused: ({ reason }) => RefusedClaim({ reason }),
      RetryLater: ({ reason }) => WillRetryClaim({ reason }),
    }),
  )

/**
 * Runs one Requested claim: the checks, then the signer, then the claim's
 * end written with a change notice for open pages. Anything that fails on
 * the way, the held list, Instant, leaves the claim Requested to run again.
 */
export const runClaim = (
  claim: ClaimRecord,
  dependencies: ClaimDependencies,
): Effect.Effect<ClaimRun> =>
  Effect.gen(function* () {
    const listings = yield* dependencies.readListings
    const accounts = yield* dependencies.personAccounts(claim.holder)
    const plan = planClaim(claim, listings, accounts)
    const outcome = yield* M.value(plan).pipe(
      M.withReturnType<Effect.Effect<SignerOutcome>>(),
      M.tagsExhaustive({
        PayClaim: () => dependencies.sign(claim),
        RefuseClaim: ({ reason }) => Effect.succeed(Refused({ reason })),
      }),
    )
    const nowMs = yield* dependencies.nowMs
    const maybeUpdate = claimUpdateOf(outcome, nowMs)
    if (Option.isSome(maybeUpdate)) {
      yield* dependencies.finishClaim(claim, maybeUpdate.value)
    }
    return runOfOutcome(outcome)
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(WillRetryClaim({ reason: error.message })),
    ),
  )

// QUEUE

const retryBaseMs = 30_000
const retryMostMs = 10 * 60_000

/** How soon a claim whose send waits for the chain is asked about again: a Solana block is under a second, a send expires in about a minute. */
export const confirmingDelayMs = 10_000

/** How long a claim waits before its next run: 30 seconds, doubling, at most ten minutes. */
export const retryDelayMs = (attempt: number): number =>
  Math.min(retryBaseMs * 2 ** Math.min(attempt, 20), retryMostMs)

type Waiting = Readonly<{
  claim: ClaimRecord
  attempt: number
  dueAtMs: number
}>

const byRequestedAt = Order.mapInput(
  Order.Number,
  (waiting: Waiting) => waiting.claim.requestedAtMs,
)

/** The claims waiting on this Mac, the oldest first, one run at a time each. */
export type ClaimQueue = Readonly<{
  offer: (claims: ReadonlyArray<ClaimRecord>) => void
  takeDue: (nowMs: number) => Option.Option<ClaimRecord>
  settle: (claimKey: string, run: ClaimRun['_tag'], nowMs: number) => void
}>

/**
 * The claims waiting on this Mac. `offer` takes Instant's list of
 * Requested claims: a claim no longer on it is forgotten unless it is
 * running. `takeDue` hands out the oldest claim whose time has come and
 * that is not running. `settle` ends a run: a claim whose send waits for
 * the chain is asked about again in ten seconds; a claim to try again
 * waits longer each time; a paid or refused one is never taken again,
 * whatever a late list says.
 */
export const makeClaimQueue = (): ClaimQueue => {
  const waiting = new Map<string, Waiting>()
  const running = new Set<string>()
  const settled = new Set<string>()
  return {
    offer: claims => {
      const offered = new Set(Array.map(claims, ({ claimKey }) => claimKey))
      for (const claimKey of [...waiting.keys()]) {
        if (!offered.has(claimKey) && !running.has(claimKey)) {
          waiting.delete(claimKey)
        }
      }
      for (const claim of claims) {
        const maybeKnown = Option.fromNullishOr(waiting.get(claim.claimKey))
        if (settled.has(claim.claimKey)) {
          continue
        } else if (Option.isSome(maybeKnown)) {
          waiting.set(claim.claimKey, { ...maybeKnown.value, claim })
        } else {
          waiting.set(claim.claimKey, { claim, attempt: 0, dueAtMs: 0 })
        }
      }
    },
    takeDue: nowMs => {
      const maybeDue = Array.match(
        Array.filter(
          [...waiting.values()],
          entry => entry.dueAtMs <= nowMs && !running.has(entry.claim.claimKey),
        ),
        {
          onEmpty: () => Option.none<Waiting>(),
          onNonEmpty: due => Option.some(Array.min(due, byRequestedAt)),
        },
      )
      if (Option.isSome(maybeDue)) {
        running.add(maybeDue.value.claim.claimKey)
      }
      return Option.map(maybeDue, entry => entry.claim)
    },
    settle: (claimKey, run, nowMs) => {
      running.delete(claimKey)
      const maybeEntry = Option.fromNullishOr(waiting.get(claimKey))
      const isRunAgain = run === 'WillRetryClaim' || run === 'ConfirmingClaim'
      if (run === 'ConfirmingClaim' && Option.isSome(maybeEntry)) {
        waiting.set(claimKey, {
          ...maybeEntry.value,
          dueAtMs: nowMs + confirmingDelayMs,
        })
      } else if (run === 'WillRetryClaim' && Option.isSome(maybeEntry)) {
        waiting.set(claimKey, {
          ...maybeEntry.value,
          attempt: maybeEntry.value.attempt + 1,
          dueAtMs: nowMs + retryDelayMs(maybeEntry.value.attempt),
        })
      } else if (!isRunAgain) {
        waiting.delete(claimKey)
        settled.add(claimKey)
      }
    },
  }
}
