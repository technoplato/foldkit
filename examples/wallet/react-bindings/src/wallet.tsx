import { Layer } from 'effect'
import * as Program from 'foldkit/program'
import type { ReactNode } from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'
import {
  AddedAddressBookEntry,
  AddressBookEntry,
  ChangedTransferAmount,
  ChangedTransferRecipient,
  type ClipboardCopyRequest,
  ComposedTransfer,
  ImportedAddressBookEntries,
  type Message,
  type Model,
  RemovedAddressBookEntry,
  RequestedChallengeSignature,
  RequestedClipboardCopy,
  RequestedNextTransactionHistoryPage,
  RequestedSignedTransactionSubmission,
  RequestedTestFunding,
  RequestedTransactionHistoryReload,
  RequestedTransferPreview,
  RequestedWalletCreation,
  RequestedWalletProfilesReload,
  RequestedWalletRefresh,
  ResumedTransactionObservation,
  SelectedSendNetwork,
  SelectedWalletNetworkMode,
  SendNetworkSelection,
  SigningChallenge,
  TransferRequest,
  type WalletNetworkMode,
  WalletProgram,
  type WalletResources,
  initialModel,
} from 'wallet-core-example'

/** An executable renderer-neutral transfer composition accepted by Wallet actions. */
export const WalletTransferComposition = TransferRequest
/** A renderer-neutral transfer composition accepted by Wallet actions. */
export type WalletTransferComposition = typeof WalletTransferComposition.Type

/** Domain actions exposed to React consumers of the Wallet Program. */
export type WalletActions = Readonly<{
  requestedClipboardCopy: (request: ClipboardCopyRequest) => void
  requestedWalletCreation: () => void
  requestedWalletProfilesReload: () => void
  selectedWalletNetworkMode: (networkMode: WalletNetworkMode) => void
  selectedSendNetwork: (selection: SendNetworkSelection) => void
  requestedWalletRefresh: () => void
  changedTransferAmount: (value: string) => void
  changedTransferRecipient: (value: string) => void
  requestedTestFunding: () => void
  requestedTransactionHistoryReload: () => void
  requestedNextTransactionHistoryPage: () => void
  requestedTransferPreview: () => void
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

/** The canonical initial public Wallet state used before host loading. */
export const initialWalletRoute: WalletInitialRoute =
  Program.state(initialModel)

/** Creates domain-shaped React bindings from host-selected Wallet resources. */
export const makeWalletReactClient = <ResourceError,>(
  resources: Layer.Layer<WalletResources, ResourceError>,
) => {
  const client = createReplayableReactProgramClient<
    Model,
    Message,
    WalletActions,
    WalletInitialRoute,
    WalletResources,
    ResourceError
  >({
    createActions: enqueueMessage => ({
      requestedClipboardCopy: request =>
        enqueueMessage(RequestedClipboardCopy.make({ request })),
      requestedWalletCreation: () =>
        enqueueMessage(RequestedWalletCreation.make({})),
      requestedWalletProfilesReload: () =>
        enqueueMessage(RequestedWalletProfilesReload.make({})),
      selectedWalletNetworkMode: networkMode =>
        enqueueMessage(SelectedWalletNetworkMode.make({ networkMode })),
      selectedSendNetwork: selection =>
        enqueueMessage(SelectedSendNetwork.make({ selection })),
      requestedWalletRefresh: () =>
        enqueueMessage(RequestedWalletRefresh.make({})),
      changedTransferAmount: value =>
        enqueueMessage(ChangedTransferAmount.make({ value })),
      changedTransferRecipient: value =>
        enqueueMessage(ChangedTransferRecipient.make({ value })),
      requestedTestFunding: () => enqueueMessage(RequestedTestFunding.make({})),
      requestedTransactionHistoryReload: () =>
        enqueueMessage(RequestedTransactionHistoryReload.make({})),
      requestedNextTransactionHistoryPage: () =>
        enqueueMessage(RequestedNextTransactionHistoryPage.make({})),
      requestedTransferPreview: () =>
        enqueueMessage(RequestedTransferPreview.make({})),
      importedAddressBookEntries: entries =>
        enqueueMessage(ImportedAddressBookEntries.make({ entries })),
      addedAddressBookEntry: entry =>
        enqueueMessage(AddedAddressBookEntry.make({ entry })),
      removedAddressBookEntry: entryId =>
        enqueueMessage(RemovedAddressBookEntry.make({ entryId })),
      composedTransfer: request =>
        enqueueMessage(ComposedTransfer.make({ request })),
      requestedSignedTransactionSubmission: previewId =>
        enqueueMessage(
          RequestedSignedTransactionSubmission.make({ previewId }),
        ),
      requestedChallengeSignature: challenge =>
        enqueueMessage(RequestedChallengeSignature.make({ challenge })),
      resumedTransactionObservation: () =>
        enqueueMessage(ResumedTransactionObservation.make({})),
    }),
    name: 'Wallet',
    program: WalletProgram,
    resources,
    route: initialRoute => initialRoute,
  })

  const WalletProvider = ({
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
      <client.Provider initialRoute={route} fallback={fallback}>
        {children}
      </client.Provider>
    )
  }

  return {
    WalletProvider,
    useWalletActions: client.useActions,
    useWalletLifecycle: client.useLifecycle,
    useWalletModel: client.useModel,
    useWalletReplay: client.useReplay,
  }
}
