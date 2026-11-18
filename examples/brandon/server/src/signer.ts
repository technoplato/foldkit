import { Effect, Option } from 'effect'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { maybeEnv } from './env.js'
import {
  type SignerOutcome,
  type SignerRun,
  signerArgumentsOf,
  signerOutcomeOf,
} from './heldClaims.js'
import type { ClaimRecord } from './store.js'

// SIGNER

/** How long one send may take: a process start and the CLI's own bounded calls, with room to spare. */
export const signerTimeoutMs = 30_000

/** Where `scribe-wallet` is: `SCRIBE_WALLET_BIN`, else `~/Scribe/tools/scribe-wallet`. */
export const signerBinary = (): string =>
  Option.getOrElse(maybeEnv('SCRIBE_WALLET_BIN'), () =>
    join(homedir(), 'Scribe', 'tools', 'scribe-wallet'),
  )

/** Which program signs, and how long it may take. */
export type SignerConfig = Readonly<{
  binary: string
  timeoutMs: number
}>

const runSigner = (
  { binary, timeoutMs }: SignerConfig,
  args: ReadonlyArray<string>,
): Promise<SignerRun> =>
  new Promise(resolve => {
    const stdout: Array<string> = []
    const stderr: Array<string> = []
    const state = { isTimedOut: false, isSettled: false }
    const settle = (maybeExitCode: Option.Option<number>): void => {
      if (!state.isSettled) {
        state.isSettled = true
        clearTimeout(timer)
        resolve({
          maybeExitCode,
          stdout: stdout.join(''),
          stderr: stderr.join(''),
          isTimedOut: state.isTimedOut,
        })
      }
    }
    const child = spawn(binary, [...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    // NOTE: a program killed past its time can leave a child of its own
    // holding the pipes open, so the run ends here, not on their close.
    const timer = setTimeout(() => {
      state.isTimedOut = true
      child.kill('SIGKILL')
      child.stdout.destroy()
      child.stderr.destroy()
      settle(Option.none())
    }, timeoutMs)
    child.stdout.setEncoding('utf8').on('data', (text: string) => {
      stdout.push(text)
    })
    child.stderr.setEncoding('utf8').on('data', (text: string) => {
      stderr.push(text)
    })
    child.on('error', error => {
      stderr.push(`The signer did not start: ${error.message}\n`)
      settle(Option.none())
    })
    child.on('close', exitCode => {
      settle(Option.fromNullishOr(exitCode))
    })
  })

/**
 * The signer: `scribe-wallet send` for one claim's payout, stopped when it
 * runs past its time. It never fails as an Effect: every way a run ends,
 * a program that did not start included, is a SignerOutcome, and only a
 * refusal or a failed send fails the claim.
 */
export const makeScribeWalletSigner =
  (config: SignerConfig) =>
  (claim: ClaimRecord): Effect.Effect<SignerOutcome> =>
    Effect.map(
      Effect.promise(() => runSigner(config, signerArgumentsOf(claim))),
      run => signerOutcomeOf(run, claim),
    )
