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
      'CreateWallet',
      'ToggleWalletNetwork',
      'SelectNextSendNetwork',
      'UseSuggestedTestTransferAmount',
      'ShowReceivingInstruction',
      'ReloadWalletHistory',
      'PreviewWalletTransaction',
      'SignWalletChallenge',
      'ShowWalletStatePath',
      'ShowWalletReplayPath',
    ])
    expect(walletOpenTuiSummary(model)).toContain('8 accounts')
    expect(walletOpenTuiSummary(model)).toContain(
      'Send simulated-ethereum-account · ETH · Ethereum Sepolia',
    )
    expect(walletOpenTuiSummary(model)).toContain('Transactions 1')
    expect(walletOpenTuiSummary(model)).toContain(
      'Observation ObservingTransactions',
    )
    expect(walletOpenTuiSummary(model)).toContain(
      'History LoadedTransactionHistory',
    )
    expect(walletOpenTuiSummary(model)).toContain('0 wallets Testnet')
  })
})
