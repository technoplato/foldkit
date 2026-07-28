import { Array, Effect } from 'effect'
import * as Runtime from 'foldkit/program-runtime'
import { describe, expect, it } from 'vitest'
import { WalletProgram } from 'wallet-core-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'

import {
  interactionsForWalletOpenTui,
  walletOpenTuiProgram,
  walletOpenTuiSummary,
} from './presentation.js'

describe('Wallet OpenTUI host', () => {
  it('consumes the exact canonical Wallet Program export', () => {
    expect(walletOpenTuiProgram).toBe(WalletProgram)
  })

  it('derives every required host operation from the canonical Model', async () => {
    const model = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.makeProgramRuntime({
            program: WalletProgram,
            resources: SimulatedWalletResources,
          })
          const initialized = yield* runtime.initialization
          yield* runtime.shutdown
          return initialized
        }),
      ),
    )
    const tags = Array.map(
      interactionsForWalletOpenTui(model),
      interaction => interaction._tag,
    )

    expect(tags).toStrictEqual([
      'ShowWallet',
      'ShowReceivingInstruction',
      'PreviewWalletTransaction',
      'SignWalletChallenge',
      'ShowWalletStatePath',
      'ShowWalletReplayPath',
    ])
    expect(walletOpenTuiSummary(model)).toContain('2 accounts')
    expect(walletOpenTuiSummary(model)).toContain('Transactions 3')
  })
})
