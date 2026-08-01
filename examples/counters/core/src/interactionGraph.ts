import * as Counter from 'counter-core-example'
import { Array, Match as M, Option } from 'effect'
import {
  ActivatedInteraction,
  Available,
  type InteractionAction,
  type InteractionGroup,
  InteractionId,
  type InteractionInvocationFacts,
  type InteractionNode,
  type InteractionOccurrenceId,
  InteractionPathSegment,
  type InteractionProjection,
  InteractionReference,
  InteractionSource,
  type ResolvedInteractionOccurrence,
  make,
  makeAdmission,
  makeSchemas,
} from 'foldkit/interaction-graph'

import {
  CounterDetailTarget,
  CounterFactTarget,
  CounterListTarget,
  DeleteCounterTarget,
  type Message,
} from './message.js'
import {
  type CounterDetailMode,
  type CounterId,
  type CounterRow,
  type Model,
} from './model.js'
import {
  Interaction,
  type InteractionAnchor,
  type InteractionIdentitySource,
  destinationForModel,
  interactionsForModel,
  messageForInteraction,
} from './presentation.js'
import { MultipleCountersProgram } from './program.js'
import { navigationTargetToPath, navigationToPath } from './route.js'

/** Schema constructors for the Multiple Counters interaction graph. */
export const MultipleCountersInteractionSchemas = makeSchemas(Interaction)

const rootSource = InteractionSource.make({
  programId: MultipleCountersProgram.id,
  instancePath: [],
})

const pathSegment = (
  submodelId: string,
  instanceId: string,
): InteractionPathSegment =>
  InteractionPathSegment.make({ submodelId, instanceId })

const counterPath = (counterId: CounterId) => [
  pathSegment('Counter', counterId),
]

const counterSource = (counterId: CounterId): InteractionSource =>
  InteractionSource.make({
    programId: MultipleCountersProgram.id,
    instancePath: counterPath(counterId),
  })

const detailSource = (
  counterId: CounterId,
  detailPresentationId: string,
): InteractionSource =>
  InteractionSource.make({
    programId: MultipleCountersProgram.id,
    instancePath: [
      ...counterPath(counterId),
      pathSegment('CounterDetail', detailPresentationId),
    ],
  })

const factSource = (
  counterId: CounterId,
  detailPresentationId: string,
  requestId: string,
): InteractionSource =>
  InteractionSource.make({
    programId: MultipleCountersProgram.id,
    instancePath: [
      ...counterPath(counterId),
      pathSegment('CounterDetail', detailPresentationId),
      pathSegment('CounterFactAlert', requestId),
    ],
  })

const deleteConfirmationSource = (
  counterId: CounterId,
  detailPresentationId: string,
  confirmationId: string,
): InteractionSource =>
  InteractionSource.make({
    programId: MultipleCountersProgram.id,
    instancePath: [
      ...counterPath(counterId),
      pathSegment('CounterDetail', detailPresentationId),
      pathSegment('DeleteCounterConfirmation', confirmationId),
    ],
  })

const sourceForMessage = (message: Message): InteractionSource =>
  M.value(message).pipe(
    M.withReturnType<InteractionSource>(),
    M.tagsExhaustive({
      ClickedAddCounter: () => rootSource,
      GotCounterMessage: ({ counterId }) => counterSource(counterId),
      SelectedCounter: ({ counterId }) => counterSource(counterId),
      DismissedCounterDetail: ({ counterId, detailPresentationId }) =>
        detailSource(counterId, detailPresentationId),
      ClickedShowCounterFact: ({ counterId, detailPresentationId }) =>
        detailSource(counterId, detailPresentationId),
      DismissedCounterFactAlert: ({
        counterId,
        detailPresentationId,
        requestId,
      }) => factSource(counterId, detailPresentationId, requestId),
      ClickedDeleteCounter: ({ counterId, detailPresentationId }) =>
        detailSource(counterId, detailPresentationId),
      CancelledDeleteCounter: ({
        confirmationId,
        counterId,
        detailPresentationId,
      }) =>
        deleteConfirmationSource(
          counterId,
          detailPresentationId,
          confirmationId,
        ),
      ConfirmedDeleteCounter: ({
        confirmationId,
        counterId,
        detailPresentationId,
      }) =>
        deleteConfirmationSource(
          counterId,
          detailPresentationId,
          confirmationId,
        ),
      OpenedNavigation: () => rootSource,
    }),
  )

const sourceForInteraction = (interaction: Interaction): InteractionSource =>
  M.value(interaction).pipe(
    M.withReturnType<InteractionSource>(),
    M.tagsExhaustive({
      SendMessageInteraction: ({ message }) => sourceForMessage(message),
      AddCounterInteraction: () => rootSource,
      SelectCounterInteraction: ({ counterId }) => counterSource(counterId),
      ShowCounterFactInteraction: ({ counterId, detailPresentationId }) =>
        detailSource(counterId, detailPresentationId),
      OpenDeleteCounterInteraction: ({ counterId }) => counterSource(counterId),
      DeleteCounterInteraction: ({ counterId, detailPresentationId }) =>
        detailSource(counterId, detailPresentationId),
    }),
  )

const interactionId = (
  source: InteractionSource,
  token: string,
): InteractionId => InteractionId.make({ source, token })

const reference = (
  destinationUri: string,
  source: InteractionSource,
  token: string,
): InteractionReference =>
  InteractionReference.make({
    destinationUri,
    interactionId: interactionId(source, token),
  })

const counterMessageToken = (message: Counter.Message): string =>
  M.value(message).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      ClickedDecrement: () => 'DecrementCounter',
      ClickedIncrement: () => 'IncrementCounter',
      ClickedReset: () => 'ResetCounter',
    }),
  )

const messageToken = (message: Message): string =>
  M.value(message).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      ClickedAddCounter: () => 'AddCounter',
      GotCounterMessage: ({ message }) => counterMessageToken(message),
      SelectedCounter: () => 'OpenCounter',
      DismissedCounterDetail: () => 'BackToCounters',
      ClickedShowCounterFact: () => 'ShowCounterFact',
      DismissedCounterFactAlert: () => 'DismissCounterFact',
      ClickedDeleteCounter: () => 'DeleteCounter',
      CancelledDeleteCounter: () => 'CancelDeleteCounter',
      ConfirmedDeleteCounter: () => 'ConfirmDeleteCounter',
      OpenedNavigation: () => 'OpenDestination',
    }),
  )

const semanticToken = (interaction: Interaction): string =>
  M.value(interaction).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      SendMessageInteraction: ({ message }) => messageToken(message),
      AddCounterInteraction: () => 'AddCounter',
      SelectCounterInteraction: () => 'OpenCounter',
      ShowCounterFactInteraction: () => 'ShowCounterFact',
      OpenDeleteCounterInteraction: () => 'DeleteCounter',
      DeleteCounterInteraction: () => 'DeleteCounter',
    }),
  )

const listDestinationUri = (): string =>
  navigationTargetToPath(CounterListTarget.make({}))

const detailDestinationUri = (counterId: CounterId): string =>
  navigationTargetToPath(CounterDetailTarget.make({ counterId }))

const factDestinationUri = (counterId: CounterId): string =>
  navigationTargetToPath(CounterFactTarget.make({ counterId }))

const deleteDestinationUri = (counterId: CounterId): string =>
  navigationTargetToPath(DeleteCounterTarget.make({ counterId }))

const maybeDestinationForInteraction = (
  interaction: Interaction,
): Option.Option<string> =>
  M.value(interaction).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      SendMessageInteraction: ({ message }) =>
        M.value(message).pipe(
          M.withReturnType<Option.Option<string>>(),
          M.tagsExhaustive({
            ClickedAddCounter: () => Option.none(),
            GotCounterMessage: () => Option.none(),
            SelectedCounter: ({ counterId }) =>
              Option.some(detailDestinationUri(counterId)),
            DismissedCounterDetail: () => Option.some(listDestinationUri()),
            ClickedShowCounterFact: ({ counterId }) =>
              Option.some(factDestinationUri(counterId)),
            DismissedCounterFactAlert: ({ counterId }) =>
              Option.some(detailDestinationUri(counterId)),
            ClickedDeleteCounter: ({ counterId }) =>
              Option.some(deleteDestinationUri(counterId)),
            CancelledDeleteCounter: ({ counterId }) =>
              Option.some(detailDestinationUri(counterId)),
            ConfirmedDeleteCounter: () => Option.some(listDestinationUri()),
            OpenedNavigation: () => Option.none(),
          }),
        ),
      AddCounterInteraction: () => Option.none(),
      SelectCounterInteraction: ({ counterId }) =>
        Option.some(detailDestinationUri(counterId)),
      ShowCounterFactInteraction: ({ counterId }) =>
        Option.some(factDestinationUri(counterId)),
      OpenDeleteCounterInteraction: ({ counterId }) =>
        Option.some(deleteDestinationUri(counterId)),
      DeleteCounterInteraction: ({ counterId }) =>
        Option.some(deleteDestinationUri(counterId)),
    }),
  )

const actionForInteraction = (
  destinationUri: string,
  interaction: Interaction,
): InteractionAction<Interaction> =>
  MultipleCountersInteractionSchemas.InteractionAction.make({
    reference: reference(
      destinationUri,
      sourceForInteraction(interaction),
      semanticToken(interaction),
    ),
    label: interaction.label,
    role: interaction.role,
    availability: Available.make({}),
    maybeDestinationUri: maybeDestinationForInteraction(interaction),
    descriptor: interaction,
  })

const actionsForAnchor = (
  destinationUri: string,
  interactions: ReadonlyArray<Interaction>,
  predicate: (anchor: InteractionAnchor) => boolean,
): ReadonlyArray<InteractionAction<Interaction>> =>
  Array.map(
    Array.filter(interactions, interaction => predicate(interaction.anchor)),
    interaction => actionForInteraction(destinationUri, interaction),
  )

const primaryReference = (
  actions: ReadonlyArray<InteractionAction<Interaction>>,
  token: string,
): Option.Option<InteractionReference> =>
  Option.map(
    Array.findFirst(
      actions,
      action => action.reference.interactionId.token === token,
    ),
    action => action.reference,
  )

const counterRowGroup = (
  destinationUri: string,
  model: Model,
  counter: CounterRow,
): InteractionGroup<Interaction> => {
  const actions = actionsForAnchor(
    destinationUri,
    interactionsForModel(model),
    anchor =>
      anchor._tag === 'CounterRowAnchor' && anchor.counterId === counter.id,
  )
  const source = counterSource(counter.id)
  return MultipleCountersInteractionSchemas.InteractionGroup.make({
    interactionId: interactionId(source, 'CounterRow'),
    label: counter.id,
    role: 'CounterRow',
    children: [
      MultipleCountersInteractionSchemas.InteractionInspection.make({
        interactionId: interactionId(source, 'CounterValue'),
        label: 'Count',
        role: 'Value',
        value: counter.counter.count.toString(),
      }),
      ...actions,
    ],
    maybePrimaryInteractionReference: primaryReference(actions, 'OpenCounter'),
  })
}

const listProjection = (
  model: Model,
  destinationUri: string,
): InteractionProjection<Interaction> => {
  const interactions = interactionsForModel(model)
  const listActions = actionsForAnchor(
    destinationUri,
    interactions,
    anchor => anchor._tag === 'CounterListAnchor',
  )
  return MultipleCountersInteractionSchemas.InteractionProjection.make({
    destinationUri,
    root: MultipleCountersInteractionSchemas.InteractionGroup.make({
      interactionId: interactionId(rootSource, 'CounterList'),
      label: 'Counters',
      role: 'CounterList',
      children: [
        ...listActions,
        ...Array.map(model.rows, row =>
          counterRowGroup(destinationUri, model, row),
        ),
      ],
      maybePrimaryInteractionReference: primaryReference(
        listActions,
        'AddCounter',
      ),
    }),
  })
}

const detailModeLabel = (mode: CounterDetailMode): string =>
  M.value(mode).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      CounterFactAlert: ({ status }) =>
        M.value(status).pipe(
          M.withReturnType<string>(),
          M.tagsExhaustive({
            LoadingCounterFact: () => 'Loading counter fact',
            LoadedCounterFact: ({ fact }) => fact.text,
            FailedCounterFact: ({ reason }) => reason,
          }),
        ),
      DeleteCounterConfirmation: () => 'Delete this counter?',
    }),
  )

const modeGroup = (
  destinationUri: string,
  model: Model,
  counterId: CounterId,
  detailPresentationId: string,
  mode: CounterDetailMode,
): InteractionGroup<Interaction> => {
  const interactions = interactionsForModel(model)
  const actions = actionsForAnchor(
    destinationUri,
    interactions,
    anchor =>
      anchor._tag === 'CounterFactAlertAnchor' ||
      anchor._tag === 'DeleteCounterConfirmationAnchor',
  )
  const source = M.value(mode).pipe(
    M.withReturnType<InteractionSource>(),
    M.tagsExhaustive({
      CounterFactAlert: ({ requestId }) =>
        factSource(counterId, detailPresentationId, requestId),
      DeleteCounterConfirmation: ({ confirmationId }) =>
        deleteConfirmationSource(
          counterId,
          detailPresentationId,
          confirmationId,
        ),
    }),
  )
  const token =
    mode._tag === 'CounterFactAlert'
      ? 'CounterFactAlert'
      : 'DeleteCounterConfirmation'
  const primaryToken =
    mode._tag === 'CounterFactAlert'
      ? 'DismissCounterFact'
      : 'CancelDeleteCounter'
  return MultipleCountersInteractionSchemas.InteractionGroup.make({
    interactionId: interactionId(source, token),
    label: token,
    role: 'Presentation',
    children: [
      MultipleCountersInteractionSchemas.InteractionInspection.make({
        interactionId: interactionId(source, `${token}Content`),
        label: 'Status',
        role: 'Status',
        value: detailModeLabel(mode),
      }),
      ...actions,
    ],
    maybePrimaryInteractionReference: primaryReference(actions, primaryToken),
  })
}

const detailProjection = (
  model: Model,
  destinationUri: string,
  counter: CounterRow,
  detailPresentationId: string,
  maybeMode: Option.Option<CounterDetailMode>,
): InteractionProjection<Interaction> => {
  const source = detailSource(counter.id, detailPresentationId)
  const actions = actionsForAnchor(
    destinationUri,
    interactionsForModel(model),
    anchor => anchor._tag === 'CounterDetailAnchor',
  )
  const inspection =
    MultipleCountersInteractionSchemas.InteractionInspection.make({
      interactionId: interactionId(source, 'CounterValue'),
      label: 'Count',
      role: 'Value',
      value: counter.counter.count.toString(),
    })
  const detailContent: Readonly<{
    children: ReadonlyArray<InteractionNode<Interaction>>
    maybePrimaryInteractionReference: Option.Option<InteractionReference>
  }> = Option.isSome(maybeMode)
    ? (() => {
        const presentation = modeGroup(
          destinationUri,
          model,
          counter.id,
          detailPresentationId,
          maybeMode.value,
        )
        return {
          children: [inspection, presentation],
          maybePrimaryInteractionReference:
            presentation.maybePrimaryInteractionReference,
        }
      })()
    : {
        children: [inspection, ...actions],
        maybePrimaryInteractionReference: primaryReference(
          actions,
          'BackToCounters',
        ),
      }
  return MultipleCountersInteractionSchemas.InteractionProjection.make({
    destinationUri,
    root: MultipleCountersInteractionSchemas.InteractionGroup.make({
      interactionId: interactionId(source, 'CounterDetail'),
      label: counter.id,
      role: 'CounterDetail',
      children: detailContent.children,
      maybePrimaryInteractionReference:
        detailContent.maybePrimaryInteractionReference,
    }),
  })
}

/** Projects the current Model into one ordered destination-qualified interaction tree. */
export const interactionProjectionForModel = (
  model: Model,
): InteractionProjection<Interaction> => {
  const destinationUri = navigationToPath(model.navigation)
  const destination = destinationForModel(model)
  return M.value(destination).pipe(
    M.withReturnType<InteractionProjection<Interaction>>(),
    M.tagsExhaustive({
      CounterListDestination: () => listProjection(model, destinationUri),
      CounterDetailDestination: ({
        counter,
        detailPresentationId,
        maybeMode,
      }) =>
        detailProjection(
          model,
          destinationUri,
          counter,
          detailPresentationId,
          maybeMode,
        ),
    }),
  )
}

/** The canonical Schema-backed semantic interaction graph for Multiple Counters. */
export const MultipleCountersInteractionGraph = make({
  program: MultipleCountersProgram,
  Descriptor: Interaction,
  projectionForModel: interactionProjectionForModel,
  messageForOccurrence: ({
    resolved,
    context,
  }: Readonly<{
    model: Model
    resolved: ResolvedInteractionOccurrence<Interaction>
    context: InteractionIdentitySource
  }>) =>
    resolved.node._tag === 'InteractionAction'
      ? Option.some(messageForInteraction(resolved.node.descriptor, context))
      : Option.none(),
})

/** Pairs the Multiple Counters graph with authenticated deterministic context. */
export const MultipleCountersInteractionAdmission = makeAdmission({
  graph: MultipleCountersInteractionGraph,
  contextForInvocation: (facts: InteractionInvocationFacts) =>
    interactionIdentitySourceForOccurrence(facts.occurrenceId),
})

/** Creates a Schema-backed activation claim for a current interaction reference. */
export const activatedInteraction = (
  interactionReference: InteractionReference,
  occurrenceId: InteractionOccurrenceId,
): ActivatedInteraction =>
  ActivatedInteraction.make({
    reference: interactionReference,
    occurrenceId,
  })

/** Derives every invocation identity from one canonical occurrence identity. */
export const interactionIdentitySourceForOccurrence = (
  occurrenceId: InteractionOccurrenceId,
): InteractionIdentitySource => ({
  counterDetailPresentationId: () => `detail-${occurrenceId}`,
  counterFactRequestId: () => `fact-${occurrenceId}`,
  counterId: () => `counter-${occurrenceId}`,
  deleteCounterConfirmationId: () => `delete-${occurrenceId}`,
})

/** Adapts a local identity generator for non-interaction navigation openings. */
export const makeInteractionIdentitySource = (
  nextIdentity: () => string,
): InteractionIdentitySource => ({
  counterDetailPresentationId: () => `detail-${nextIdentity()}`,
  counterFactRequestId: () => `fact-${nextIdentity()}`,
  counterId: () => `counter-${nextIdentity()}`,
  deleteCounterConfirmationId: () => `delete-${nextIdentity()}`,
})
