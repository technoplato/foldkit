import * as Counter from 'counter-core-example'
import {
  CancelledDeleteCounter,
  ClickedAddCounter,
  ClickedDeleteCounter,
  ClickedShowCounterFact,
  ConfirmedDeleteCounter,
  CounterList,
  DismissedCounterDetail,
  DismissedCounterFactAlert,
  GotCounterMessage,
  type Interaction,
  type Message,
  type Model,
  MultipleCountersProgram,
  type Navigation,
  OpenedNavigation,
  SelectedCounter,
  StaticCounterFactClient,
  modelForNavigation,
} from 'counters-core-example'
import { Program } from 'foldkit'
import type { ReactNode } from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'

/** Actions exposed to React consumers of the Multiple Counters Program. */
export type MultipleCountersActions = Readonly<{
  cancelledDeleteCounter: () => void
  clickedAddCounter: () => void
  clickedDecrementCounter: (counterId: string) => void
  clickedDeleteCounter: () => void
  clickedIncrementCounter: (counterId: string) => void
  clickedResetCounter: (counterId: string) => void
  clickedShowCounterFact: () => void
  confirmedDeleteCounter: () => void
  dismissedCounterDetail: () => void
  dismissedCounterFactAlert: () => void
  performed: (interaction: Interaction) => void
  openedNavigation: (navigation: Navigation) => void
  selectedCounter: (counterId: string) => void
}>

/** One portable state or replay route accepted by the Multiple Counters client. */
export type MultipleCountersInitialRoute = Program.ResolvedProgramRoute<
  Model,
  Message
>

/** The canonical fresh Multiple Counters route shared by host carriers. */
export const initialMultipleCountersRoute: MultipleCountersInitialRoute =
  Program.state(modelForNavigation(CounterList.make({})))

/** The canonical React and React Native client for Multiple Counters. */
export const MultipleCountersClient = createReplayableReactProgramClient<
  Model,
  Message,
  MultipleCountersActions,
  MultipleCountersInitialRoute,
  import('counters-core-example').CounterFactClient
>({
  createActions: enqueueMessage => ({
    cancelledDeleteCounter: () => enqueueMessage(CancelledDeleteCounter()),
    clickedAddCounter: () => enqueueMessage(ClickedAddCounter()),
    clickedDecrementCounter: counterId =>
      enqueueMessage(
        GotCounterMessage({
          counterId,
          message: Counter.ClickedDecrement(),
        }),
      ),
    clickedDeleteCounter: () => enqueueMessage(ClickedDeleteCounter()),
    clickedIncrementCounter: counterId =>
      enqueueMessage(
        GotCounterMessage({
          counterId,
          message: Counter.ClickedIncrement(),
        }),
      ),
    clickedResetCounter: counterId =>
      enqueueMessage(
        GotCounterMessage({ counterId, message: Counter.ClickedReset() }),
      ),
    clickedShowCounterFact: () => enqueueMessage(ClickedShowCounterFact()),
    confirmedDeleteCounter: () => enqueueMessage(ConfirmedDeleteCounter()),
    dismissedCounterDetail: () => enqueueMessage(DismissedCounterDetail()),
    dismissedCounterFactAlert: () =>
      enqueueMessage(DismissedCounterFactAlert()),
    performed: interaction => enqueueMessage(interaction.message),
    openedNavigation: navigation =>
      enqueueMessage(OpenedNavigation({ navigation })),
    selectedCounter: counterId =>
      enqueueMessage(SelectedCounter({ counterId })),
  }),
  name: 'MultipleCounters',
  program: MultipleCountersProgram,
  resources: StaticCounterFactClient,
  route: initialRoute => initialRoute,
})

/** Provides one URL-initialized Multiple Counters runtime to React children. */
export const MultipleCountersProvider = ({
  children,
  fallback,
  flags,
}: Readonly<{
  children: ReactNode
  fallback?: ReactNode
  flags: Navigation
}>) => (
  <MultipleCountersClient.Provider
    initialRoute={Program.state(modelForNavigation(flags))}
    fallback={fallback}
  >
    {children}
  </MultipleCountersClient.Provider>
)

/** Reads the current immutable Multiple Counters Model. */
export const useMultipleCountersModel = MultipleCountersClient.useModel

/** Returns stable host-callable Multiple Counters actions. */
export const useMultipleCountersActions = MultipleCountersClient.useActions

/** Returns controls for inspecting and branching the same Multiple Counters tape. */
export const useMultipleCountersReplay = MultipleCountersClient.useReplay
