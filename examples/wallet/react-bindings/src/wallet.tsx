import * as Program from 'foldkit/program'
import type { ReactNode } from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'
import {
  AddedAddressBookEntry,
  AddressBookEntry,
  ComposedTransfer,
  ImportedAddressBookEntries,
  type Message,
  type Model,
  RemovedAddressBookEntry,
  RequestedChallengeSignature,
  RequestedSignedTransactionSubmission,
  RequestedWalletRefresh,
  ResumedTransactionObservation,
  SigningChallenge,
  TransferDraft,
  WalletProgram,
  type WalletResources,
  initialModel,
} from 'wallet-core-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'

/** An executable renderer-neutral transfer composition accepted by Wallet actions. */
export const WalletTransferComposition = TransferDraft
/** A renderer-neutral transfer composition accepted by Wallet actions. */
export type WalletTransferComposition = typeof WalletTransferComposition.Type

/** Domain actions exposed to React consumers of the Wallet Program. */
export type WalletActions = Readonly<{
  requestedWalletRefresh: () => void
  importedAddressBookEntries: (entries: ReadonlyArray<AddressBookEntry>) => void
  addedAddressBookEntry: (entry: AddressBookEntry) => void
  removedAddressBookEntry: (entryId: string) => void
  composedTransfer: (composition: WalletTransferComposition) => void
  requestedSignedTransactionSubmission: (previewId: string) => void
  requestedChallengeSignature: (challenge: SigningChallenge) => void
  resumedTransactionObservation: () => void
}>

/** One portable state or replay route accepted by the Wallet client. */
export type WalletInitialRoute = Program.ResolvedProgramRoute<Model, Message>

/** The canonical initial public Wallet state used before simulated loading. */
export const initialWalletRoute: WalletInitialRoute =
  Program.state(initialModel)

/** The canonical replayable React client for the Wallet Program. */
export const WalletClient = createReplayableReactProgramClient<
  Model,
  Message,
  WalletActions,
  WalletInitialRoute,
  WalletResources
>({
  createActions: enqueueMessage => ({
    requestedWalletRefresh: () =>
      enqueueMessage(RequestedWalletRefresh.make({})),
    importedAddressBookEntries: entries =>
      enqueueMessage(ImportedAddressBookEntries.make({ entries })),
    addedAddressBookEntry: entry =>
      enqueueMessage(AddedAddressBookEntry.make({ entry })),
    removedAddressBookEntry: entryId =>
      enqueueMessage(RemovedAddressBookEntry.make({ entryId })),
    composedTransfer: draft => enqueueMessage(ComposedTransfer.make({ draft })),
    requestedSignedTransactionSubmission: previewId =>
      enqueueMessage(RequestedSignedTransactionSubmission.make({ previewId })),
    requestedChallengeSignature: challenge =>
      enqueueMessage(RequestedChallengeSignature.make({ challenge })),
    resumedTransactionObservation: () =>
      enqueueMessage(ResumedTransactionObservation.make({})),
  }),
  name: 'Wallet',
  program: WalletProgram,
  resources: SimulatedWalletResources,
  route: initialRoute => initialRoute,
})

/** Provides one simulated Wallet runtime to React children. */
export const WalletProvider = ({
  children,
  fallback,
  initialRoute,
}: Readonly<{
  children: ReactNode
  fallback?: ReactNode
  initialRoute?: WalletInitialRoute
}>) => {
  const route = initialRoute ?? initialWalletRoute

  return (
    <WalletClient.Provider initialRoute={route} fallback={fallback}>
      {children}
    </WalletClient.Provider>
  )
}

/** Reads the current immutable public Wallet Model. */
export const useWalletModel = WalletClient.useModel

/** Returns stable host-callable Wallet actions. */
export const useWalletActions = WalletClient.useActions

/** Returns inert inspection and live branching controls for the Wallet tape. */
export const useWalletReplay = WalletClient.useReplay
