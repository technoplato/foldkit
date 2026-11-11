import { Effect, Match as M, Option } from 'effect'

import { makeClaimsAdmin } from './claimsStore.js'
import { brandonEnv } from './env.js'
import {
  type ClaimRun,
  heldListingsOf,
  makeClaimQueue,
  runClaim,
  shortenedAddress,
} from './heldClaims.js'
import { heldListPath, readHeldListAt } from './heldList.js'
import { makeScribeWalletSigner, signerBinary, signerTimeoutMs } from './signer.js'
import type { ClaimRecord } from './store.js'
import { stamped } from './watcher.js'

// CLAIMS

/**
 * The held-money claims worker. It runs on Michael's Mac, where the keys
 * of the accounts Scribe holds for people are, never on the mini. It
 * follows Requested `walletClaims` rows through Instant, runs one at a
 * time, and pays each out with `scribe-wallet send --all` under the
 * claim's own send id, only from an account this Mac's held list names
 * for that person. launchd keeps it alive.
 */

const pumpEveryMs = 5_000

const store = makeClaimsAdmin(brandonEnv())
const queue = makeClaimQueue()
const listPath = heldListPath()
const sign = makeScribeWalletSigner({
  binary: signerBinary(),
  timeoutMs: signerTimeoutMs,
})
const readListings = Effect.map(readHeldListAt(listPath), heldListingsOf)
const state = { isRunning: false }

const named = (claim: ClaimRecord): string =>
  `${claim.networkId} ${shortenedAddress(claim.fromAddress)} to ${shortenedAddress(claim.toAddress)}`

const said = (run: ClaimRun): string =>
  M.value(run).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      PaidClaim: ({ transactionId }) => `sent, transaction ${transactionId}`,
      ConfirmingClaim: ({ transactionId }) =>
        `broadcast as ${transactionId}, waiting for the chain to include it`,
      RefusedClaim: ({ reason }) => `failed, nothing sent: ${reason}`,
      WillRetryClaim: ({ reason }) => `left to try again: ${reason}`,
    }),
  )

const pump = (): void => {
  if (state.isRunning) {
    return
  }
  const maybeClaim = queue.takeDue(Date.now())
  if (Option.isNone(maybeClaim)) {
    return
  }
  const claim = maybeClaim.value
  state.isRunning = true
  console.log(stamped(`claims: paying out ${named(claim)}`))
  void Effect.runPromise(
    runClaim(claim, {
      readListings,
      personAccounts: store.personAccounts,
      sign,
      finishClaim: store.finishClaim,
      nowMs: Effect.sync(() => Date.now()),
    }),
  ).then(run => {
    queue.settle(claim.claimKey, run._tag, Date.now())
    console.log(stamped(`claims: ${named(claim)} ${said(run)}`))
    state.isRunning = false
    pump()
  })
}

// NOTE: launchd keeps this process alive, and a fresh start is the one
// sure way back from a subscription Instant ended.
store.followRequestedClaims(
  claims => {
    queue.offer(claims)
    pump()
  },
  error => {
    console.error(stamped(`claims: the claim list failed: ${error.message}; exiting`))
    process.exit(1)
  },
)

setInterval(pump, pumpEveryMs)

console.log(
  stamped(
    `held claims: following Requested walletClaims; paying only from ${listPath}`,
  ),
)
