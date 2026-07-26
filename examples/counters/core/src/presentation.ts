import * as Counter from 'counter-core-example'
import { Array, Match as M, Option, Schema as S } from 'effect'

import {
  CancelledDeleteCounter,
  ClickedAddCounter,
  ClickedDeleteCounter,
  ClickedShowCounterFact,
  ConfirmedDeleteCounter,
  DismissedCounterDetail,
  DismissedCounterFactAlert,
  GotCounterMessage,
  Message,
  SelectedCounter,
} from './message.js'
import { CounterDetailMode, CounterRow, type Model } from './model.js'

/** Presents the list destination to a host. */
export const CounterListDestination = S.TaggedStruct('CounterListDestination', {
  counters: S.Array(CounterRow),
})
/** Presents one counter detail destination to a host. */
export const CounterDetailDestination = S.TaggedStruct(
  'CounterDetailDestination',
  {
    counter: CounterRow,
    maybeMode: S.Option(CounterDetailMode),
  },
)

/** Every destination presentation a host must handle. */
export const Destination = S.Union([
  CounterListDestination,
  CounterDetailDestination,
])
/** Every destination presentation a host must handle. */
export type Destination = typeof Destination.Type

/** The visual role of one valid interaction. */
export const InteractionRole = S.Literals(['Default', 'Primary', 'Destructive'])
/** The visual role of one valid interaction. */
export type InteractionRole = typeof InteractionRole.Type

/** One currently valid host interaction and its canonical Message. */
export const Interaction = S.Struct({
  token: S.String,
  label: S.String,
  role: InteractionRole,
  message: Message,
})

/** One currently valid host interaction. */
export type Interaction = typeof Interaction.Type

const listDestination = (model: Model): Destination =>
  CounterListDestination.make({ counters: model.rows })

/** Exhaustively maps navigation state to a destination presentation. */
export const destinationForModel = (model: Model): Destination =>
  M.value(model.navigation).pipe(
    M.withReturnType<Destination>(),
    M.tagsExhaustive({
      CounterList: () => listDestination(model),
      CounterDetail: ({ counterId, maybeMode }) => {
        const maybeCounter = Array.findFirst(
          model.rows,
          row => row.id === counterId,
        )
        if (Option.isSome(maybeCounter)) {
          return CounterDetailDestination.make({
            counter: maybeCounter.value,
            maybeMode,
          })
        } else {
          return listDestination(model)
        }
      },
    }),
  )

const interaction = (
  token: string,
  label: string,
  role: InteractionRole,
  message: Message,
): Interaction => ({ token, label, role, message })

const counterInteractions = (counterId: string): ReadonlyArray<Interaction> => [
  interaction(
    `decrement:${counterId}`,
    'Decrement',
    'Default',
    GotCounterMessage({
      counterId,
      message: Counter.ClickedDecrement(),
    }),
  ),
  interaction(
    `increment:${counterId}`,
    'Increment',
    'Default',
    GotCounterMessage({
      counterId,
      message: Counter.ClickedIncrement(),
    }),
  ),
]

const interactionsForDetailMode = (
  mode: typeof CounterDetailMode.Type,
): ReadonlyArray<Interaction> =>
  M.value(mode).pipe(
    M.withReturnType<ReadonlyArray<Interaction>>(),
    M.tagsExhaustive({
      CounterFactAlert: () => [
        interaction(
          'dismiss',
          'Dismiss fact',
          'Primary',
          DismissedCounterFactAlert(),
        ),
      ],
      DeleteCounterConfirmation: () => [
        interaction('cancel', 'Cancel', 'Default', CancelledDeleteCounter()),
        interaction(
          'confirm-delete',
          'Delete counter',
          'Destructive',
          ConfirmedDeleteCounter(),
        ),
      ],
    }),
  )

/** Returns the complete valid interaction set for the current state and mode. */
export const interactionsForModel = (
  model: Model,
): ReadonlyArray<Interaction> => {
  const destination = destinationForModel(model)
  return M.value(destination).pipe(
    M.withReturnType<ReadonlyArray<Interaction>>(),
    M.tagsExhaustive({
      CounterListDestination: ({ counters }) => [
        interaction('add', 'Add counter', 'Primary', ClickedAddCounter()),
        ...Array.flatMap(counters, counter => [
          interaction(
            `open:${counter.id}`,
            `Open ${counter.id}`,
            'Default',
            SelectedCounter({ counterId: counter.id }),
          ),
          ...counterInteractions(counter.id),
        ]),
      ],
      CounterDetailDestination: ({ counter, maybeMode }) => {
        if (Option.isSome(maybeMode)) {
          return interactionsForDetailMode(maybeMode.value)
        } else {
          return [
            interaction(
              'back',
              'Back to counters',
              'Default',
              DismissedCounterDetail(),
            ),
            ...counterInteractions(counter.id),
            interaction(
              'reset',
              'Reset',
              'Default',
              GotCounterMessage({
                counterId: counter.id,
                message: Counter.ClickedReset(),
              }),
            ),
            interaction(
              'fact',
              'Show counter fact',
              'Primary',
              ClickedShowCounterFact(),
            ),
            interaction(
              'delete',
              'Delete counter',
              'Destructive',
              ClickedDeleteCounter(),
            ),
          ]
        }
      },
    }),
  )
}

/** Resolves one CLI or host token only when it is valid in the current state. */
export const messageForInteractionToken = (
  model: Model,
  token: string,
): Option.Option<Message> =>
  Option.map(
    Array.findFirst(
      interactionsForModel(model),
      candidate => candidate.token === token,
    ),
    candidate => candidate.message,
  )
