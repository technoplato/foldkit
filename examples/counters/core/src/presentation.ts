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
  GotChild,
  Message,
  type NavigationIdentitySource,
  SelectedCounter,
} from './message.js'
import {
  CounterDetailMode,
  CounterDetailPresentationId,
  CounterFactRequestId,
  type CounterId,
  CounterRow,
  DeleteCounterConfirmationId,
  type Model,
} from './model.js'

/** Presents the list destination to a host. */
export const CounterListDestination = S.TaggedStruct('CounterListDestination', {
  counters: S.Array(CounterRow),
})
/** Presents one counter detail destination to a host. */
export const CounterDetailDestination = S.TaggedStruct(
  'CounterDetailDestination',
  {
    counter: CounterRow,
    detailPresentationId: CounterDetailPresentationId,
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

/** The visual role one destination presents with, derived from its kind. */
export const PresentationStyleTag = S.Literals(['Push', 'Sheet', 'Dialog'])
/** The visual role one destination presents with, derived from its kind. */
export type PresentationStyleTag = typeof PresentationStyleTag.Type

const overlayStyleOf = (mode: CounterDetailMode): PresentationStyleTag =>
  M.value(mode).pipe(
    M.withReturnType<PresentationStyleTag>(),
    M.tagsExhaustive({
      CounterFactAlert: () => 'Sheet',
      DeleteCounterConfirmation: () => 'Dialog',
    }),
  )

/** Derives the visual role of one destination; never stored on the Model. */
export const presentationStyleOf = (
  destination: Destination,
): PresentationStyleTag =>
  M.value(destination).pipe(
    M.withReturnType<PresentationStyleTag>(),
    M.tagsExhaustive({
      CounterListDestination: () => 'Push',
      CounterDetailDestination: ({ maybeMode }) =>
        Option.match(maybeMode, {
          onNone: () => 'Push',
          onSome: overlayStyleOf,
        }),
    }),
  )

/** The visual role of one valid interaction. */
export const InteractionRole = S.Literals(['Default', 'Primary', 'Destructive'])
/** The visual role of one valid interaction. */
export type InteractionRole = typeof InteractionRole.Type

/** Anchors an interaction at the counter-list destination. */
export const CounterListAnchor = S.TaggedStruct('CounterListAnchor', {})
/** Anchors an interaction at one stable Counter row. */
export const CounterRowAnchor = S.TaggedStruct('CounterRowAnchor', {
  counterId: CounterRow.fields.id,
})
/** Anchors an interaction at one Counter-detail presentation occurrence. */
export const CounterDetailAnchor = S.TaggedStruct('CounterDetailAnchor', {
  counterId: CounterRow.fields.id,
  detailPresentationId: CounterDetailPresentationId,
})
/** Anchors an interaction at one fact presentation occurrence. */
export const CounterFactAlertAnchor = S.TaggedStruct('CounterFactAlertAnchor', {
  counterId: CounterRow.fields.id,
  detailPresentationId: CounterDetailPresentationId,
  requestId: CounterFactRequestId,
})
/** Anchors an interaction at one delete-confirmation occurrence. */
export const DeleteCounterConfirmationAnchor = S.TaggedStruct(
  'DeleteCounterConfirmationAnchor',
  {
    confirmationId: DeleteCounterConfirmationId,
    counterId: CounterRow.fields.id,
    detailPresentationId: CounterDetailPresentationId,
  },
)

/** Every semantic location at which a Client may present an interaction. */
export const InteractionAnchor = S.Union([
  CounterListAnchor,
  CounterRowAnchor,
  CounterDetailAnchor,
  CounterFactAlertAnchor,
  DeleteCounterConfirmationAnchor,
])
/** Every semantic location at which a Client may present an interaction. */
export type InteractionAnchor = typeof InteractionAnchor.Type

const InteractionMetadata = {
  anchor: InteractionAnchor,
  label: S.String,
  role: InteractionRole,
  token: S.String,
}

/** An interaction whose canonical Message already contains every input. */
export const SendMessageInteraction = S.TaggedStruct('SendMessageInteraction', {
  ...InteractionMetadata,
  message: Message,
})
/** An add interaction requiring a fresh stable Counter identity. */
export const AddCounterInteraction = S.TaggedStruct(
  'AddCounterInteraction',
  InteractionMetadata,
)
/** A selection requiring a fresh Counter-detail presentation identity. */
export const SelectCounterInteraction = S.TaggedStruct(
  'SelectCounterInteraction',
  { ...InteractionMetadata, counterId: CounterRow.fields.id },
)
/** A fact interaction requiring a fresh request identity. */
export const ShowCounterFactInteraction = S.TaggedStruct(
  'ShowCounterFactInteraction',
  {
    ...InteractionMetadata,
    counterId: CounterRow.fields.id,
    detailPresentationId: CounterDetailPresentationId,
  },
)
/** A row delete requiring fresh detail and confirmation identities. */
export const OpenDeleteCounterInteraction = S.TaggedStruct(
  'OpenDeleteCounterInteraction',
  { ...InteractionMetadata, counterId: CounterRow.fields.id },
)
/** A detail delete requiring a fresh confirmation identity. */
export const DeleteCounterInteraction = S.TaggedStruct(
  'DeleteCounterInteraction',
  {
    ...InteractionMetadata,
    counterId: CounterRow.fields.id,
    detailPresentationId: CounterDetailPresentationId,
  },
)

/** Every currently valid interaction descriptor owned by the Program. */
export const Interaction = S.Union([
  SendMessageInteraction,
  AddCounterInteraction,
  SelectCounterInteraction,
  ShowCounterFactInteraction,
  OpenDeleteCounterInteraction,
  DeleteCounterInteraction,
])
/** Every currently valid interaction descriptor owned by the Program. */
export type Interaction = typeof Interaction.Type

/** Supplies fresh event identities only when a Client invokes an interaction. */
export type InteractionIdentitySource = NavigationIdentitySource &
  Readonly<{ counterId: () => CounterId }>

const listDestination = (model: Model): Destination =>
  CounterListDestination.make({ counters: model.rows })

/** Exhaustively maps navigation state to a destination presentation. */
export const destinationForModel = (model: Model): Destination =>
  M.value(model.navigation).pipe(
    M.withReturnType<Destination>(),
    M.tagsExhaustive({
      CounterList: () => listDestination(model),
      CounterDetail: ({ counterId, maybeMode, presentationId }) => {
        const maybeCounter = Array.findFirst(
          model.rows,
          row => row.id === counterId,
        )
        if (Option.isSome(maybeCounter)) {
          return CounterDetailDestination.make({
            counter: maybeCounter.value,
            detailPresentationId: presentationId,
            maybeMode,
          })
        } else {
          return listDestination(model)
        }
      },
    }),
  )

const sendMessageInteraction = (
  anchor: InteractionAnchor,
  token: string,
  label: string,
  role: InteractionRole,
  message: Message,
): Interaction =>
  SendMessageInteraction.make({ anchor, token, label, role, message })

const counterInteractions = (
  counterId: CounterId,
  anchor: InteractionAnchor,
): ReadonlyArray<Interaction> => [
  sendMessageInteraction(
    anchor,
    `decrement:${counterId}`,
    'Decrement',
    'Default',
    GotChild({
      id: counterId,
      message: Counter.Decrement(),
    }),
  ),
  sendMessageInteraction(
    anchor,
    `increment:${counterId}`,
    'Increment',
    'Default',
    GotChild({
      id: counterId,
      message: Counter.Increment(),
    }),
  ),
]

const interactionsForDetailMode = (
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
  mode: typeof CounterDetailMode.Type,
): ReadonlyArray<Interaction> =>
  M.value(mode).pipe(
    M.withReturnType<ReadonlyArray<Interaction>>(),
    M.tagsExhaustive({
      CounterFactAlert: ({ requestId }) => [
        sendMessageInteraction(
          CounterFactAlertAnchor.make({
            counterId,
            detailPresentationId,
            requestId,
          }),
          'dismiss',
          'Dismiss fact',
          'Primary',
          DismissedCounterFactAlert({
            counterId,
            detailPresentationId,
            requestId,
          }),
        ),
      ],
      DeleteCounterConfirmation: ({ confirmationId }) => [
        sendMessageInteraction(
          DeleteCounterConfirmationAnchor.make({
            confirmationId,
            counterId,
            detailPresentationId,
          }),
          'cancel',
          'Cancel',
          'Default',
          CancelledDeleteCounter({
            confirmationId,
            counterId,
            detailPresentationId,
          }),
        ),
        sendMessageInteraction(
          DeleteCounterConfirmationAnchor.make({
            confirmationId,
            counterId,
            detailPresentationId,
          }),
          'confirm-delete',
          'Delete counter',
          'Destructive',
          ConfirmedDeleteCounter({
            confirmationId,
            counterId,
            detailPresentationId,
          }),
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
        AddCounterInteraction.make({
          anchor: CounterListAnchor.make({}),
          token: 'add',
          label: 'Add counter',
          role: 'Primary',
        }),
        ...Array.flatMap(counters, counter => [
          SelectCounterInteraction.make({
            anchor: CounterRowAnchor.make({ counterId: counter.id }),
            token: `open:${counter.id}`,
            label: `Open ${counter.id}`,
            role: 'Default',
            counterId: counter.id,
          }),
          ...counterInteractions(
            counter.id,
            CounterRowAnchor.make({ counterId: counter.id }),
          ),
          OpenDeleteCounterInteraction.make({
            anchor: CounterRowAnchor.make({ counterId: counter.id }),
            token: `delete:${counter.id}`,
            label: `Delete ${counter.id}`,
            role: 'Destructive',
            counterId: counter.id,
          }),
        ]),
      ],
      CounterDetailDestination: ({
        counter,
        detailPresentationId,
        maybeMode,
      }) => {
        if (Option.isSome(maybeMode)) {
          return interactionsForDetailMode(
            counter.id,
            detailPresentationId,
            maybeMode.value,
          )
        } else {
          const detailAnchor = CounterDetailAnchor.make({
            counterId: counter.id,
            detailPresentationId,
          })
          return [
            sendMessageInteraction(
              detailAnchor,
              'back',
              'Back to counters',
              'Default',
              DismissedCounterDetail({
                counterId: counter.id,
                detailPresentationId,
              }),
            ),
            ...counterInteractions(counter.id, detailAnchor),
            sendMessageInteraction(
              detailAnchor,
              'reset',
              'Reset',
              'Default',
              GotChild({
                id: counter.id,
                message: Counter.Reset(),
              }),
            ),
            ShowCounterFactInteraction.make({
              anchor: detailAnchor,
              token: 'fact',
              label: 'Show counter fact',
              role: 'Primary',
              counterId: counter.id,
              detailPresentationId,
            }),
            DeleteCounterInteraction.make({
              anchor: detailAnchor,
              token: 'delete',
              label: 'Delete counter',
              role: 'Destructive',
              counterId: counter.id,
              detailPresentationId,
            }),
          ]
        }
      },
    }),
  )
}

/** Resolves one interaction while allocating identities at invocation time. */
export const messageForInteraction = (
  interaction: Interaction,
  identitySource: InteractionIdentitySource,
): Message =>
  M.value(interaction).pipe(
    M.withReturnType<Message>(),
    M.tagsExhaustive({
      SendMessageInteraction: ({ message }) => message,
      AddCounterInteraction: () =>
        ClickedAddCounter({ counterId: identitySource.counterId() }),
      SelectCounterInteraction: ({ counterId }) =>
        SelectedCounter({
          counterId,
          detailPresentationId: identitySource.counterDetailPresentationId(),
        }),
      ShowCounterFactInteraction: ({ counterId, detailPresentationId }) =>
        ClickedShowCounterFact({
          counterId,
          detailPresentationId,
          requestId: identitySource.counterFactRequestId(),
        }),
      OpenDeleteCounterInteraction: ({ counterId }) =>
        ClickedDeleteCounter({
          confirmationId: identitySource.deleteCounterConfirmationId(),
          counterId,
          detailPresentationId: identitySource.counterDetailPresentationId(),
        }),
      DeleteCounterInteraction: ({ counterId, detailPresentationId }) =>
        ClickedDeleteCounter({
          confirmationId: identitySource.deleteCounterConfirmationId(),
          counterId,
          detailPresentationId,
        }),
    }),
  )

/** Resolves one token only when it is valid in the current Model. */
export const messageForInteractionToken = (
  model: Model,
  token: string,
  identitySource: InteractionIdentitySource,
): Option.Option<Message> =>
  Option.map(
    Array.findFirst(
      interactionsForModel(model),
      candidate => candidate.token === token,
    ),
    interaction => messageForInteraction(interaction, identitySource),
  )
