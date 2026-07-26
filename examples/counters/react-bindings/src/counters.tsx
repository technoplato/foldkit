import * as Counter from 'counter-core-example'
import {
  CancelledDeleteCounter,
  ClickedAddCounter,
  ClickedDeleteCounter,
  ClickedShowCounterFact,
  ConfirmedDeleteCounter,
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
import { createReplayableReactProgramBindingsWithFlags } from 'shared-react-bindings-example'

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

const bindings = createReplayableReactProgramBindingsWithFlags<
  Model,
  Message,
  MultipleCountersActions,
  Navigation,
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
  route: navigation => Program.state(modelForNavigation(navigation)),
})

/** Provides one Multiple Counters runtime to React children. */
export const MultipleCountersProvider = bindings.Provider

/** Reads the current immutable Multiple Counters Model. */
export const useMultipleCountersModel = bindings.useModel

/** Returns stable host-callable Multiple Counters actions. */
export const useMultipleCountersActions = bindings.useActions

/** Returns controls for inspecting and branching the same Multiple Counters tape. */
export const useMultipleCountersReplay = bindings.useReplay
