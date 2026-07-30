import { Array, Effect, Option } from 'effect'
import * as Runtime from 'foldkit/program-runtime'
import { describe, expect, it } from 'vitest'
import {
  ChangedTransferAmount,
  RequestedWalletCreation,
  SelectedSendNetwork,
  SelectedWalletNetworkMode,
  WalletProgram,
  activeWalletAccounts,
  availableSendNetworkSelections,
  primaryWalletSuggestedTestTransferAmount,
  primaryWalletTestFundingMethod,
  sendNetworkSelectionLabel,
  walletAccountBalanceLabel,
} from 'wallet-core-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'

import {
  interactionsForWalletOpenTui,
  walletNetworkModeAtIndex,
  walletOpenTuiProgram,
  walletOpenTuiSummary,
  walletSendNetworkSelectionAtIndex,
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
    expect(walletOpenTuiSummary(model)).toContain('Fixture data')
    expect(walletOpenTuiSummary(model)).toContain('12 accounts')
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

  it('rebinds selectors, summaries, and valid interactions across every simulated rail', async () => {
    const walletNetworkModes = Array.map([0, 1, 2], index =>
      Option.getOrThrow(walletNetworkModeAtIndex(index)),
    )
    expect(Option.isNone(walletNetworkModeAtIndex(3))).toBe(true)
    const rows = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.makeProgramRuntime({
            program: WalletProgram,
            resources: SimulatedWalletResources,
          })
          yield* runtime.initialization
          const withWallet = yield* runtime.run(
            RequestedWalletCreation.make({}),
          )
          if (withWallet.portfolio._tag !== 'LoadedPortfolio') {
            return yield* Effect.die('Expected a loaded simulated portfolio')
          }
          const modeRows = yield* Effect.forEach(
            walletNetworkModes,
            networkMode =>
              Effect.gen(function* () {
                const modeModel = yield* runtime.run(
                  SelectedWalletNetworkMode.make({ networkMode }),
                )
                if (modeModel.portfolio._tag !== 'LoadedPortfolio') {
                  return yield* Effect.die(
                    `Expected a loaded ${networkMode} portfolio`,
                  )
                }
                const portfolio = modeModel.portfolio.snapshot
                const activeAccounts = Option.match(
                  Array.head(modeModel.wallets),
                  {
                    onNone: () => [],
                    onSome: wallet =>
                      activeWalletAccounts(
                        wallet,
                        portfolio.networks,
                        networkMode,
                      ),
                  },
                )
                const selections = availableSendNetworkSelections(
                  portfolio,
                  networkMode,
                )
                const indexedSelections = Array.map(
                  selections,
                  (_selection, index) =>
                    Option.getOrThrow(
                      walletSendNetworkSelectionAtIndex(selections, index),
                    ),
                )
                expect(
                  Option.isNone(
                    walletSendNetworkSelectionAtIndex(
                      selections,
                      Array.length(selections),
                    ),
                  ),
                ).toBe(true)
                return yield* Effect.forEach(indexedSelections, selection =>
                  Effect.gen(function* () {
                    const selectedModel = yield* runtime.run(
                      SelectedSendNetwork.make({ selection }),
                    )
                    const suggestedAmount = Option.getOrThrow(
                      primaryWalletSuggestedTestTransferAmount(selectedModel),
                    )
                    const readyModel = yield* runtime.run(
                      ChangedTransferAmount.make({ value: suggestedAmount }),
                    )
                    if (readyModel.portfolio._tag !== 'LoadedPortfolio') {
                      return yield* Effect.die(
                        `Expected ${selection.networkId} to stay loaded`,
                      )
                    }
                    return {
                      networkMode,
                      selection,
                      activeAccounts,
                      summary: walletOpenTuiSummary(readyModel),
                      balance: walletAccountBalanceLabel(
                        readyModel,
                        selection.accountId,
                      ),
                      selectedLabel: sendNetworkSelectionLabel(
                        readyModel.portfolio.snapshot,
                        readyModel.wallets,
                        selection,
                      ),
                      interactionTags: Array.map(
                        interactionsForWalletOpenTui(readyModel),
                        interaction => interaction._tag,
                      ),
                      fundingMethod: Option.getOrThrow(
                        primaryWalletTestFundingMethod(readyModel),
                      )._tag,
                      history: readyModel.transactionHistory._tag,
                      observation: readyModel.transactionObservation._tag,
                    }
                  }),
                )
              }),
          )
          yield* runtime.shutdown
          return Array.flatten(modeRows)
        }),
      ),
    )

    expect(rows).toHaveLength(12)
    Array.forEach(walletNetworkModes, networkMode => {
      expect(
        Array.filter(rows, row => row.networkMode === networkMode),
      ).toHaveLength(4)
    })
    expect(
      Array.dedupe(Array.map(rows, row => row.selection.networkId)),
    ).toHaveLength(12)
    Array.forEach(rows, row => {
      expect(row.activeAccounts).toHaveLength(4)
      expect(row.balance).not.toBe('—')
      expect(row.balance).not.toBe('Unavailable')
      expect(row.summary).toContain('12 accounts | 12 balances | 0 unavailable')
      expect(row.summary).toContain('Fixture data')
      expect(row.summary).toContain('1 wallets')
      expect(row.summary).toContain(`Send ${row.selectedLabel}`)
      expect(row.summary).toContain('Transactions 1')
      expect(row.summary).toContain('Observation ObservingTransactions')
      expect(row.summary).toContain('History LoadedTransactionHistory')
      expect(row.summary).toContain('Funding ReadyToRequestTestFunding')
      expect(row.history).toBe('LoadedTransactionHistory')
      expect(row.observation).toBe('ObservingTransactions')
      expect(row.interactionTags).toContain('UseSuggestedTestTransferAmount')
      expect(row.interactionTags).toContain('ShowReceivingInstruction')
      expect(row.interactionTags).toContain('ReloadWalletHistory')
      expect(row.interactionTags).toContain('PreviewWalletTransaction')
      if (row.networkMode === 'Live') {
        expect(row.fundingMethod).toBe('UnavailableTestFundingMethod')
        expect(row.interactionTags).not.toContain('RequestWalletTestFunding')
      } else {
        expect(row.fundingMethod).toBe('AdapterTestFundingMethod')
        expect(row.interactionTags).toContain('RequestWalletTestFunding')
      }
    })
  })
})
