// Scribe #2134: one held-money claim through the worker's own code against a local validator. Run by claim-local.sh,
// which starts solana-test-validator, funds the held account with a local airdrop and makes a fresh destination.
//
//   node claim-local.mjs <scribe-wallet> <held address> <destination address> <work folder>
//
// The claim names solana:localnet, which no Instant row can hold; the store is a fake in memory, so nothing here reaches
// Instant, and nothing reaches a public network: scribe-wallet signs on localnet only for this claim. Every check prints
// PASS or FAIL; the exit status is the number of FAILs.
import { Effect, Option } from 'effect'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  heldListingLineOf,
  heldListingsOf,
  runClaim,
} from '../dist/heldClaims.js'
import { makeScribeWalletSigner } from '../dist/signer.js'

const [wallet, heldAddress, destinationAddress, work] = process.argv.slice(2)
const solana = join(
  process.env.SOLANA_BIN ??
    join(process.env.HOME, '.local/share/solana/install/active_release/bin'),
  'solana',
)
const rpc = 'http://127.0.0.1:8899'
const network = 'solana:localnet'
const holder = `brandon-dot:${'0'.repeat(64)}`
const tally = { failures: 0 }

const check = (label, isTrue, detail = '') => {
  console.log(
    `${isTrue ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : `  (${detail})`}`,
  )
  if (!isTrue) tally.failures += 1
}

const lamportsOf = address =>
  BigInt(
    execFileSync(solana, ['balance', address, '--url', rpc, '--lamports'])
      .toString()
      .trim()
      .split(/\s+/)[0],
  )

const listPath = join(work, 'held-accounts.tsv')
writeFileSync(
  listPath,
  `${heldListingLineOf({ networkId: network, address: heldAddress, holder })}\n`,
  { mode: 0o600 },
)

const accounts = [
  { networkId: network, address: heldAddress, isHeldByScribe: true },
  { networkId: network, address: destinationAddress, isHeldByScribe: false },
]

const claimOf = (fields = {}) => {
  const requestedAtMs = Date.now()
  return {
    claimKey: `${holder}|${network}|${heldAddress}|${requestedAtMs}`,
    holder,
    networkId: network,
    fromAddress: heldAddress,
    toAddress: destinationAddress,
    sendId: randomUUID(),
    requestedAtMs,
    status: 'Requested',
    maybeAmountAtomic: Option.none(),
    maybeTransactionId: Option.none(),
    maybeFailure: Option.none(),
    updatedAtMs: requestedAtMs,
    ...fields,
  }
}

const finished = []
const signed = []
const sign = makeScribeWalletSigner({ binary: wallet, timeoutMs: 60_000 })
const dependencies = {
  readListings: Effect.sync(() =>
    heldListingsOf(readFileSync(listPath, 'utf8')),
  ),
  personAccounts: () => Effect.succeed(accounts),
  sign: claim =>
    Effect.tap(sign(claim), outcome =>
      Effect.sync(() => {
        signed.push({ claim, outcome })
      }),
    ),
  finishClaim: (claim, update) =>
    Effect.sync(() => {
      finished.push({ claim, update })
    }),
  nowMs: Effect.sync(() => Date.now()),
}

const heldBefore = lamportsOf(heldAddress)
const destinationBefore = lamportsOf(destinationAddress)
check(
  'the held account has local coins to move',
  heldBefore > 0n,
  `${heldBefore} lamports`,
)

const confirmingTries = 30
const confirmingPauseMs = 2_000

const runUntilSettled = async claim => {
  const runs = []
  for (let attempt = 0; attempt < confirmingTries; attempt += 1) {
    const run = await Effect.runPromise(runClaim(claim, dependencies))
    runs.push(run._tag)
    if (run._tag !== 'ConfirmingClaim') return { run, runs }
    await new Promise(resolve => setTimeout(resolve, confirmingPauseMs))
  }
  return { run: { _tag: 'ConfirmingClaim' }, runs }
}

const claim = claimOf()
const { run: first, runs: firstRuns } = await runUntilSettled(claim)
check(
  'a claim from a listed held account to its person’s own address is paid once the chain includes it',
  first._tag === 'PaidClaim',
  `${JSON.stringify(first)}; runs ${firstRuns.join(', ')}`,
)
check(
  'every run before that waited for the chain and wrote nothing',
  firstRuns.slice(0, -1).every(tag => tag === 'ConfirmingClaim') &&
    finished.length === 1,
)
const firstUpdate = finished.at(-1)?.update
check(
  'the claim reads Sent with its amount and transaction',
  firstUpdate?.status === 'Sent' &&
    Option.isSome(firstUpdate.maybeTransactionId),
)

const heldAfter = lamportsOf(heldAddress)
const destinationAfter = lamportsOf(destinationAddress)
const moved = destinationAfter - destinationBefore
check(
  'the held account ends at zero',
  heldAfter === 0n,
  `${heldAfter} lamports`,
)
check(
  'the destination got everything less the fee',
  moved > 0n && heldBefore - moved <= 10_000n,
  `${moved} of ${heldBefore} lamports`,
)
check(
  'the amount the claim records is what the chain moved',
  firstUpdate !== undefined &&
    Option.getOrElse(firstUpdate.maybeAmountAtomic, () => '') ===
      moved.toString(),
)

const { run: again } = await runUntilSettled(claim)
const destinationAgain = lamportsOf(destinationAddress)
check(
  'the same claim run again is the same payment, never a second one',
  again._tag === 'PaidClaim' &&
    first._tag === 'PaidClaim' &&
    again.transactionId === first.transactionId,
  JSON.stringify(again),
)
check(
  'nothing more reached the destination',
  destinationAgain === destinationAfter,
  `${destinationAgain} lamports`,
)

const signedBefore = signed.length
const unlisted = await Effect.runPromise(
  runClaim(
    claimOf({ fromAddress: destinationAddress, toAddress: heldAddress }),
    dependencies,
  ),
)
check(
  'a claim from an account this Mac does not list is refused',
  unlisted._tag === 'RefusedClaim',
  JSON.stringify(unlisted),
)
check('and nothing was signed for it', signed.length === signedBefore)

process.exit(tally.failures)
