import { Array, Option } from 'effect'
import { type ReactNode, StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import {
  SigningChallenge,
  TransferRequest,
  WalletProgram,
} from 'wallet-core-example'
import { simulatedPortfolio } from 'wallet-simulated-client-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'

import { act, renderHook, waitFor } from '@testing-library/react'

import { makeWalletReactClient } from './wallet.js'
import {
  MissingWalletReplayTapeStoreError,
  parseWalletInitialRoute,
} from './walletRoute.js'

const { WalletProvider, useWalletActions, useWalletModel, useWalletReplay } =
  makeWalletReactClient(SimulatedWalletResources)

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <StrictMode>
    <WalletProvider>{children}</WalletProvider>
  </StrictMode>
)

const maybeAccount = Array.head(simulatedPortfolio.accounts)
const maybeBalance = Array.head(simulatedPortfolio.balanceSnapshot.balances)

if (Option.isNone(maybeAccount) || Option.isNone(maybeBalance)) {
  throw new Error('Expected simulated Wallet fixtures')
}

const account = maybeAccount.value
const balance = maybeBalance.value
const request = TransferRequest.make({
  transferId: 'react-transfer',
  accountId: account.accountId,
  assetId: balance.amount.assetId,
  destinationAddress: '0x2222222222222222222222222222222222222222',
  atomicUnits: '100000000000000000',
  maybeMessage: Option.some('React demo transfer'),
})

describe('Wallet React bindings', () => {
  it('maps only host-sendable facts to stable domain actions', async () => {
    const { result } = renderHook(
      () => ({
        actions: useWalletActions(),
        model: useWalletModel(),
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.model.portfolio._tag).toBe('LoadedPortfolio')
    })

    const actions = result.current.actions
    expect(Object.keys(actions).sort()).toStrictEqual([
      'addedAddressBookEntry',
      'changedTransferRecipient',
      'composedTransfer',
      'importedAddressBookEntries',
      'removedAddressBookEntry',
      'requestedChallengeSignature',
      'requestedSignedTransactionSubmission',
      'requestedTransferPreview',
      'requestedWalletCreation',
      'requestedWalletRefresh',
      'resumedTransactionObservation',
      'selectedWalletNetworkMode',
    ])

    act(() => {
      result.current.actions.requestedWalletCreation()
    })

    await waitFor(() => {
      expect(result.current.model.wallets).toHaveLength(1)
      expect(result.current.model.walletCreation._tag).toBe(
        'ReadyToCreateWallet',
      )
    })

    act(() => {
      result.current.actions.selectedWalletNetworkMode('Devnet')
    })

    await waitFor(() => {
      expect(result.current.model.walletNetworkMode).toBe('Devnet')
    })

    act(() => {
      result.current.actions.composedTransfer(request)
    })

    await waitFor(() => {
      expect(result.current.model.transaction._tag).toBe('PreviewedTransaction')
    })
    expect(result.current.actions).toBe(actions)

    const transaction = result.current.model.transaction
    if (transaction._tag !== 'PreviewedTransaction') {
      throw new Error('Expected a transaction preview')
    }

    act(() => {
      result.current.actions.requestedSignedTransactionSubmission(
        transaction.preview.previewId,
      )
    })

    await waitFor(() => {
      expect(result.current.model.transaction._tag).toBe('SubmittedTransaction')
      expect(result.current.model.transactions.length).toBeGreaterThan(0)
    })
    if (result.current.model.transaction._tag !== 'SubmittedTransaction') {
      throw new Error('Expected a submitted transaction')
    }
    expect(
      Option.isNone(
        result.current.model.transaction.submission.maybeExplorerConfirmation,
      ),
    ).toBe(true)

    act(() => {
      result.current.actions.requestedChallengeSignature(
        SigningChallenge.make({
          challengeId: 'react-challenge',
          accountId: account.accountId,
          digest: {
            algorithm: 'keccak256',
            domain: 'foldkit.example.wallet',
            digest:
              '0x434a8d65ff6dedb682353c0b64080d079094c7bc538c6bf29c5049c4dca72e22',
            encoding: 'hex',
          },
        }),
      )
    })

    await waitFor(() => {
      expect(result.current.model.signature._tag).toBe('SignedChallenge')
    })
  })

  it('exposes replay controls backed by the canonical Wallet Program', async () => {
    const { result, unmount } = renderHook(
      () => ({
        model: useWalletModel(),
        replay: useWalletReplay(),
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.model.portfolio._tag).toBe('LoadedPortfolio')
    })

    expect(result.current.replay.inspect).toBeTypeOf('function')
    expect(result.current.replay.seek).toBeTypeOf('function')
    expect(result.current.replay.stepBackward).toBeTypeOf('function')
    expect(result.current.replay.stepForward).toBeTypeOf('function')

    const tape = result.current.replay.replayRoute().tape
    expect(tape.programId).toBe(WalletProgram.id)
    expect(tape.programVersion).toBe(WalletProgram.version)

    const replayPath = await result.current.replay.replayPath()
    const statePath = await result.current.replay.statePath()
    const stateRoute = await parseWalletInitialRoute(statePath)
    expect(stateRoute._tag).toBe('State')

    const replayRoute = await parseWalletInitialRoute(replayPath)
    expect(replayRoute._tag).toBe('Replay')
    if (replayRoute._tag === 'Replay') {
      expect(replayRoute.frame).toBe(result.current.replay.frame)
      expect(replayRoute.tape.programId).toBe(tape.programId)
      expect(replayRoute.tape.programVersion).toBe(tape.programVersion)

      unmount()
      const replayWrapper = ({
        children,
      }: Readonly<{ children: ReactNode }>) => (
        <WalletProvider initialRoute={replayRoute}>{children}</WalletProvider>
      )
      const replayed = renderHook(
        () => ({
          model: useWalletModel(),
          replay: useWalletReplay(),
        }),
        { wrapper: replayWrapper },
      )

      await waitFor(() => {
        expect(replayed.result.current.replay.mode).toBe('Inspecting')
        expect(replayed.result.current.replay.frame).toBe(replayRoute.frame)
      })
    }
  })

  it('loads and previews a portable send intent through the same Program', async () => {
    const path =
      '/wallet/intent/send?account=simulated-ethereum-account&asset=ethereum%3Asepolia%3Aeth&amount=10000000000000&to=0x2222222222222222222222222222222222222222'
    const intentRoute = await parseWalletInitialRoute(path)
    const intentWrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <WalletProvider initialRoute={intentRoute}>{children}</WalletProvider>
    )
    const { result } = renderHook(() => useWalletModel(), {
      wrapper: intentWrapper,
    })

    await waitFor(() => {
      expect(result.current.transaction._tag).toBe('PreviewedTransaction')
    })
    expect(result.current.walletIntent._tag).toBe('AppliedWalletIntent')
    if (result.current.transaction._tag === 'PreviewedTransaction') {
      expect(result.current.transaction.preview.transfer.request).toMatchObject(
        {
          destinationAddress: '0x2222222222222222222222222222222222222222',
          atomicUnits: '10000000000000',
        },
      )
    }
  })

  it('rejects saved replay links without inventing a tape store', async () => {
    const path = '/wallet/replay/179f2ae7-8c0b-4e4f-8201-67a691732769?frame=4'

    await expect(parseWalletInitialRoute(path)).rejects.toStrictEqual(
      new MissingWalletReplayTapeStoreError({
        message:
          'Saved replay 179f2ae7-8c0b-4e4f-8201-67a691732769 needs a ReplayTapeStore',
        tapeId: '179f2ae7-8c0b-4e4f-8201-67a691732769',
      }),
    )
  })
})
