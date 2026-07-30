import { Array, Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  SendAssetIntent,
  WalletProgram,
  availableSendNetworkSelections,
  walletIntentRouter,
} from 'wallet-core-example'
import {
  SimulatedWalletResources,
  simulatedPortfolio,
} from 'wallet-simulated-client-example'

import {
  WalletChallengeInput,
  WalletCliOperation,
  WalletTestFundingInput,
  WalletTransferInput,
  executeWalletCli,
  walletCliProgram,
} from './host.js'

const walletTransferFixture = WalletTransferInput.make({
  transferId: 'cli-transfer',
  networkMode: 'Testnet',
  chainId: 'ethereum',
  networkId: 'ethereum:sepolia',
  accountId: 'simulated-ethereum-account',
  assetId: 'ethereum:sepolia:eth',
  destinationAddress: '0x2222222222222222222222222222222222222222',
  atomicUnits: '1000000000000000',
  maybeMessage: Option.none(),
})

const walletChallengeFixture = WalletChallengeInput.make({
  challengeId: 'cli-challenge',
  accountId: 'simulated-ethereum-account',
  algorithm: 'keccak256',
  domain: 'wallet.example/access/v1',
  digest: '0x434a8d65ff6dedb682353c0b64080d079094c7bc538c6bf29c5049c4dca72e22',
  encoding: 'hex',
})

const executeSimulatedWalletCli = (
  operation: WalletCliOperation,
  maybeCarrier = Option.none<string>(),
) => executeWalletCli(operation, maybeCarrier, SimulatedWalletResources)

describe('raw Wallet CLI host', () => {
  it('consumes the exact canonical Wallet Program export', () => {
    expect(walletCliProgram).toBe(WalletProgram)
  })

  it('awaits preview and challenge Command results', async () => {
    const preview = await Effect.runPromise(
      executeSimulatedWalletCli(
        WalletCliOperation.make({
          _tag: 'Preview',
          maybeInput: Option.some(walletTransferFixture),
        }),
      ),
    )
    const signature = await Effect.runPromise(
      executeSimulatedWalletCli(
        WalletCliOperation.make({
          _tag: 'SignChallenge',
          input: walletChallengeFixture,
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
      executeSimulatedWalletCli(
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
      executeSimulatedWalletCli(
        WalletCliOperation.make({
          _tag: 'Send',
          maybeInput: Option.some(walletTransferFixture),
        }),
      ),
    )

    expect(execution.model.transaction._tag).toBe('SubmittedTransaction')
    expect(execution.model.transactions.length).toBeGreaterThan(0)
    expect(execution.summary).toContain('Observed: yes')
    expect(execution.summary).not.toContain('Etherscan')
  })

  it('reloads and advances cursor-based transaction history', async () => {
    const reloaded = await Effect.runPromise(
      executeSimulatedWalletCli(WalletCliOperation.make({ _tag: 'History' })),
    )
    const nextPage = await Effect.runPromise(
      executeSimulatedWalletCli(
        WalletCliOperation.make({ _tag: 'NextHistoryPage' }),
      ),
    )

    expect(reloaded.summary).toContain('History: loaded')
    expect(reloaded.progress).toContain('RequestedTransactionHistoryReload')
    expect(nextPage.summary).toContain('History: loaded')
    expect(nextPage.progress).toContain('RequestedNextTransactionHistoryPage')
  })

  it('requests capability-gated test funding for an exact rail', async () => {
    const execution = await Effect.runPromise(
      executeSimulatedWalletCli(
        WalletCliOperation.make({
          _tag: 'RequestTestFunding',
          input: WalletTestFundingInput.make({
            networkMode: 'Testnet',
            chainId: 'ethereum',
            networkId: 'ethereum:sepolia',
            accountId: 'simulated-ethereum-account',
            assetId: 'ethereum:sepolia:eth',
            maybeDisplayAmount: Option.some('0.01'),
          }),
        }),
      ),
    )

    expect(execution.model.testFunding._tag).toBe('ReceivedTestFunding')
    expect(execution.summary).toContain('Test funding accepted')
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
          const execution = yield* executeSimulatedWalletCli(
            WalletCliOperation.make({
              _tag: 'Send',
              maybeInput: Option.none(),
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
      executeSimulatedWalletCli(
        WalletCliOperation.make({
          _tag: 'Preview',
          maybeInput: Option.some(
            WalletTransferInput.make({
              ...walletTransferFixture,
              destinationAddress:
                '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
            }),
          ),
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
      executeSimulatedWalletCli(
        WalletCliOperation.make({
          _tag: 'Preview',
          maybeInput: Option.some(walletTransferFixture),
        }),
      ),
    )
    const replay = await Effect.runPromise(
      executeSimulatedWalletCli(
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
