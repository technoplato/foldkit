import { Array, Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  SendAssetIntent,
  WalletProgram,
  availableSendNetworkSelections,
  walletIntentRouter,
} from 'wallet-core-example'
import { simulatedPortfolio } from 'wallet-simulated-client-example'

import {
  WalletCliOperation,
  WalletTransferInput,
  defaultWalletChallengeInput,
  defaultWalletTransferInput,
  executeWalletCli,
  walletCliProgram,
} from './host.js'

describe('raw Wallet CLI host', () => {
  it('consumes the exact canonical Wallet Program export', () => {
    expect(walletCliProgram).toBe(WalletProgram)
  })

  it('awaits preview and challenge Command results', async () => {
    const preview = await Effect.runPromise(
      executeWalletCli(
        WalletCliOperation.make({
          _tag: 'Preview',
          input: defaultWalletTransferInput,
        }),
      ),
    )
    const signature = await Effect.runPromise(
      executeWalletCli(
        WalletCliOperation.make({
          _tag: 'SignChallenge',
          input: defaultWalletChallengeInput,
        }),
      ),
    )

    expect(preview.model.transaction._tag).toBe('PreviewedTransaction')
    expect(preview.progress).toContain('SucceededPreviewTransaction')
    expect(signature.model.signature._tag).toBe('SignedChallenge')
    expect(signature.progress).toContain('SucceededSignChallenge')
  })

  it('creates all four chain accounts in one selected mode', async () => {
    const execution = await Effect.runPromise(
      executeWalletCli(
        WalletCliOperation.make({
          _tag: 'CreateWallet',
          networkMode: 'Devnet',
        }),
      ),
    )

    expect(execution.model.walletNetworkMode).toBe('Devnet')
    expect(execution.model.wallets).toHaveLength(1)
    expect(execution.summary).toContain('Bitcoin | Bitcoin Regtest')
    expect(execution.summary).toContain('Sui | Sui Devnet')
  })

  it('observes the transaction emitted by simulated submission', async () => {
    const execution = await Effect.runPromise(
      executeWalletCli(
        WalletCliOperation.make({
          _tag: 'Send',
          input: defaultWalletTransferInput,
        }),
      ),
    )

    expect(execution.model.transaction._tag).toBe('SubmittedTransaction')
    expect(execution.model.transactions.length).toBeGreaterThan(0)
    expect(execution.summary).toContain('Observed: yes')
    expect(execution.summary).not.toContain('Etherscan')
  })

  it('sends every chain in both modes from a deep link and reads every property back', async () => {
    const selections = [
      ...availableSendNetworkSelections(simulatedPortfolio, 'Devnet'),
      ...availableSendNetworkSelections(simulatedPortfolio, 'Testnet'),
    ]
    const executions = await Effect.runPromise(
      Effect.forEach(selections, selection =>
        Effect.gen(function* () {
          const account = Option.getOrThrow(
            Array.findFirst(
              simulatedPortfolio.accounts,
              candidate => candidate.accountId === selection.accountId,
            ),
          )
          const intent = SendAssetIntent.make({
            source: selection,
            atomicUnits: '1000',
            destinationAddress: account.address,
          })
          const path = yield* walletIntentRouter.print(intent)
          const execution = yield* executeWalletCli(
            WalletCliOperation.make({
              _tag: 'Send',
              input: defaultWalletTransferInput,
            }),
            Option.some(`foldkit://showcase${path}`),
          )
          return { execution, intent, path }
        }),
      ),
    )

    expect(executions).toHaveLength(8)
    Array.forEach(executions, ({ execution, intent, path }) => {
      expect(execution.model.transaction._tag).toBe('SubmittedTransaction')
      expect(execution.summary).toContain(`Intent: ${path}`)
      expect(execution.summary).toContain(
        `Network mode: ${intent.source.networkMode}`,
      )
      expect(execution.summary).toContain(`Chain: ${intent.source.chainId}`)
      expect(execution.summary).toContain(`Network: ${intent.source.networkId}`)
      expect(execution.summary).toContain(`Account: ${intent.source.accountId}`)
      expect(execution.summary).toContain(`Asset: ${intent.source.assetId}`)
      expect(execution.summary).toContain(
        `Amount atomic units: ${intent.atomicUnits}`,
      )
      expect(execution.summary).toContain(`To: ${intent.destinationAddress}`)
      expect(execution.summary).toContain('Observed: yes')
    })
  })

  it('prints the shared network-specific address guidance', async () => {
    const failure = await Effect.runPromise(
      executeWalletCli(
        WalletCliOperation.make({
          _tag: 'Preview',
          input: WalletTransferInput.make({
            ...defaultWalletTransferInput,
            destinationAddress:
              '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          }),
        }),
      ).pipe(Effect.flip),
    )

    expect(failure).toMatchObject({
      message: expect.stringContaining('That is not a valid Ethereum address.'),
    })
    expect(failure).toMatchObject({
      message: expect.stringContaining(
        '20 bytes encoded as 0x-prefixed hexadecimal.',
      ),
    })
  })

  it('inspects the portable replay path without executing historical Commands', async () => {
    const preview = await Effect.runPromise(
      executeWalletCli(
        WalletCliOperation.make({
          _tag: 'Preview',
          input: defaultWalletTransferInput,
        }),
      ),
    )
    const replay = await Effect.runPromise(
      executeWalletCli(
        WalletCliOperation.make({
          _tag: 'InspectReplay',
          maybeFrame: Option.none(),
        }),
        Option.some(preview.replayPath),
      ),
    )

    expect(replay.model).toStrictEqual(preview.model)
    expect(replay.summary).toContain('Replay frame')
  })
})
