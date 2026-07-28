import { Array, Option } from 'effect'
import { type ReactNode, StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import {
  SigningChallenge,
  WalletProgram,
  transferDraftFromInput,
} from 'wallet-core-example'
import { simulatedPortfolio } from 'wallet-simulated-client-example'

import { act, renderHook, waitFor } from '@testing-library/react'

import {
  WalletProvider,
  useWalletActions,
  useWalletModel,
  useWalletReplay,
} from './wallet.js'
import {
  MissingWalletReplayTapeStoreError,
  parseWalletInitialRoute,
} from './walletRoute.js'

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
const maybeDraft = transferDraftFromInput({
  transferId: 'react-transfer',
  accountId: account.accountId,
  network: account.network,
  destinationAddress: '0x2222222222222222222222222222222222222222',
  value: {
    ...balance.value,
    atomicUnits: '100000000000000000',
  },
  maybeMessage: Option.some('React demo transfer'),
})

if (Option.isNone(maybeDraft)) {
  throw new Error('Expected an executable simulated Wallet transfer')
}

const draft = maybeDraft.value

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
      'composedTransfer',
      'importedAddressBookEntries',
      'removedAddressBookEntry',
      'requestedChallengeSignature',
      'requestedSignedTransactionSubmission',
      'requestedWalletRefresh',
      'resumedTransactionObservation',
    ])

    act(() => {
      result.current.actions.composedTransfer(draft)
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
      expect(result.current.model.observedTransactions).toHaveLength(1)
    })

    act(() => {
      result.current.actions.requestedChallengeSignature(
        SigningChallenge.make({
          challengeId: 'react-challenge',
          accountId: account.accountId,
          digest: {
            algorithm: 'Keccak256',
            domain: 'foldkit.example.wallet',
            digestHex: '0x1234',
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
      expect(replayRoute.tape).toStrictEqual(tape)

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
