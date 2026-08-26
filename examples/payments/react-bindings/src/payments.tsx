import { Program } from 'foldkit'
import {
  ClearedCredentials,
  ConnectedWallet,
  type CredentialFieldId,
  DisconnectedWallet,
  InertPaymentProcessorLive,
  type Message,
  type Model,
  PaymentsProgram,
  type RailId,
  RecordedCredentialPresence,
  RequestedSession,
  RequestedVerify,
  ResetCheckout,
  SelectedRail,
  initialModel,
} from 'payments-core-example'
import type { ReactNode } from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'

/** Actions exposed to React consumers of the Payments Program. */
export type PaymentsActions = Readonly<{
  selectedRail: (rail: RailId) => void
  recordedCredentialPresence: (
    field: CredentialFieldId,
    isPresent: boolean,
  ) => void
  clearedCredentials: () => void
  connectedWallet: () => void
  disconnectedWallet: () => void
  requestedSession: () => void
  requestedVerify: () => void
  resetCheckout: () => void
}>

/** One portable state or replay route accepted by the Payments client. */
export type PaymentsInitialRoute = Program.ResolvedProgramRoute<Model, Message>

/** The canonical fresh Payments route shared by host carriers. */
export const initialPaymentsRoute: PaymentsInitialRoute =
  Program.state(initialModel)

/** The canonical React client for the Payments Program. */
export const PaymentsClient = createReplayableReactProgramClient<
  Model,
  Message,
  PaymentsActions,
  PaymentsInitialRoute
>({
  createActions: enqueueMessage => ({
    selectedRail: rail => enqueueMessage(SelectedRail({ rail })),
    recordedCredentialPresence: (field, isPresent) =>
      enqueueMessage(RecordedCredentialPresence({ field, isPresent })),
    clearedCredentials: () => enqueueMessage(ClearedCredentials()),
    connectedWallet: () => enqueueMessage(ConnectedWallet()),
    disconnectedWallet: () => enqueueMessage(DisconnectedWallet()),
    requestedSession: () => enqueueMessage(RequestedSession()),
    requestedVerify: () => enqueueMessage(RequestedVerify({})),
    resetCheckout: () => enqueueMessage(ResetCheckout()),
  }),
  name: 'Payments',
  program: PaymentsProgram,
  resources: InertPaymentProcessorLive,
  route: initialRoute => initialRoute,
})

/** Provides one Payments runtime to React children. */
export const PaymentsProvider = ({
  children,
  fallback,
}: Readonly<{ children: ReactNode; fallback?: ReactNode }>) => (
  <PaymentsClient.Provider
    initialRoute={initialPaymentsRoute}
    fallback={fallback}
  >
    {children}
  </PaymentsClient.Provider>
)

/** Reads the current immutable Payments Model and re-renders on Model changes. */
export const usePaymentsModel = PaymentsClient.useModel

/** Returns stable, host-callable Payments actions. */
export const usePaymentsActions = PaymentsClient.useActions
