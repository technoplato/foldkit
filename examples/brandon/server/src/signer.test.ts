import { Effect, Option } from 'effect'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { accountKeyOf } from './account.js'
import { makeScribeWalletSigner } from './signer.js'
import type { ClaimRecord } from './store.js'

const holder = `brandon-dot:${accountKeyOf('recipient@example.com')}`
const mainnet = 'solana:mainnet-beta'
const heldAddress = 'So11111111111111111111111111111111111111112'
const ownAddress = '11111111111111111111111111111111'
const sendId = '6f9619ff-8b86-d011-b42d-00c04fc964ff'
const signature = '5'.repeat(88)

const claim: ClaimRecord = {
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
}

const folder = mkdtempSync(join(tmpdir(), 'held-claims-signer-'))

const fakeSigner = (name: string, body: string): string => {
  const path = join(folder, name)
  writeFileSync(
    path,
    `#!/bin/sh\nprintf '%s\\n' "$@" > "${path}.argv"\n${body}\n`,
  )
  chmodSync(path, 0o755)
  return path
}

const answer = JSON.stringify({
  amount: { asset: 'SOL', baseUnits: '181066945', decimal: '0.181066945' },
  chain: 'solana',
  from: heldAddress,
  id: sendId.toUpperCase(),
  network: mainnet,
  status: 'pending',
  to: ownAddress,
  transactionID: signature,
})

const signWith = (binary: string, timeoutMs = 5_000) =>
  Effect.runPromise(makeScribeWalletSigner({ binary, timeoutMs })(claim))

describe('the signer on this Mac', () => {
  it('runs scribe-wallet with exactly the claim’s send, and reads what it sent', async () => {
    const binary = fakeSigner(
      'sends.sh',
      `echo 'About to sign 0.181066945 SOL on Solana Mainnet Beta' >&2\necho '${answer}'\nexit 0`,
    )
    expect(await signWith(binary)).toEqual({
      _tag: 'Sent',
      amountAtomic: '181066945',
      transactionId: signature,
    })
    expect(readFileSync(`${binary}.argv`, 'utf8').trim().split('\n')).toEqual([
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

  it('passes on a refusal in the signer’s own words', async () => {
    const binary = fakeSigner(
      'refuses.sh',
      "echo 'Refused: the transfer cannot go: nothing to send. Nothing was signed.' >&2\nexit 1",
    )
    expect(await signWith(binary)).toEqual({
      _tag: 'Refused',
      reason:
        'Refused: the transfer cannot go: nothing to send. Nothing was signed.',
    })
  })

  it('tries again after a network failure', async () => {
    const binary = fakeSigner(
      'offline.sh',
      "echo 'Network failure: the node did not answer within 5 seconds.' >&2\nexit 2",
    )
    expect((await signWith(binary))._tag).toBe('RetryLater')
  })

  it('stops a signer that runs past its time, and tries again later', async () => {
    const binary = fakeSigner('slow.sh', 'sleep 5\nexit 0')
    const startedAt = Date.now()
    expect((await signWith(binary, 300))._tag).toBe('RetryLater')
    expect(Date.now() - startedAt).toBeLessThan(4_000)
  })

  it('tries again when there is no signer to run', async () => {
    expect((await signWith(join(folder, 'missing.sh')))._tag).toBe(
      'RetryLater',
    )
  })
})
