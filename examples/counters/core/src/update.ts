import * as Counter from 'counter-core-example'
import { Array, Match as M, Option } from 'effect'
import { Command } from 'foldkit'

import { CounterFactClient } from './counterFactClient.js'
import { FetchCounterFact } from './fetchCounterFact.js'
import {
  GotCounterMessage,
  type Message,
  type NavigationOpening,
} from './message.js'
import {
  CounterDetail,
  type CounterDetailPresentationId,
  CounterFact,
  CounterFactAlert,
  type CounterFactRequestId,
  type CounterId,
  CounterList,
  CounterRow,
  DeleteCounterConfirmation,
  type DeleteCounterConfirmationId,
  FailedCounterFact,
  LoadedCounterFact,
  LoadingCounterFact,
  Model,
  type Navigation,
  maximumCounterCount,
  maximumCounterIdentityCount,
} from './model.js'

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, CounterFactClient>>,
]

const findCounter = (model: Model, counterId: CounterId) =>
  Array.findFirst(model.rows, row => row.id === counterId)

const listNavigation = () => CounterList.make({})

const detailNavigation = (
  counterId: CounterId,
  presentationId: CounterDetailPresentationId,
) => CounterDetail.make({ counterId, maybeMode: Option.none(), presentationId })

const withNavigation = (model: Model, navigation: Navigation): Model =>
  Model.make({ ...model, navigation })

const normalizeNavigation = (
  model: Model,
  navigation: Navigation,
): Navigation => {
  if (navigation._tag === 'CounterList') {
    return navigation
  }
  if (Option.isSome(findCounter(model, navigation.counterId))) {
    return navigation
  } else {
    return listNavigation()
  }
}

const loadingFactNavigation = (
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
  requestId: CounterFactRequestId,
): Navigation =>
  CounterDetail.make({
    counterId,
    maybeMode: Option.some(
      CounterFactAlert.make({
        detailPresentationId,
        requestId,
        status: LoadingCounterFact.make({}),
      }),
    ),
    presentationId: detailPresentationId,
  })

const loadedFactNavigation = (
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
  requestId: CounterFactRequestId,
  fact: CounterFact,
): Navigation =>
  CounterDetail.make({
    counterId,
    maybeMode: Option.some(
      CounterFactAlert.make({
        detailPresentationId,
        requestId,
        status: LoadedCounterFact.make({ fact }),
      }),
    ),
    presentationId: detailPresentationId,
  })

const failedFactNavigation = (
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
  requestId: CounterFactRequestId,
  reason: string,
): Navigation =>
  CounterDetail.make({
    counterId,
    maybeMode: Option.some(
      CounterFactAlert.make({
        detailPresentationId,
        requestId,
        status: FailedCounterFact.make({ reason }),
      }),
    ),
    presentationId: detailPresentationId,
  })

const fetchFact = (
  model: Model,
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
  requestId: CounterFactRequestId,
): UpdateReturn => {
  const maybeCounter = findCounter(model, counterId)
  if (Option.isNone(maybeCounter)) {
    return [withNavigation(model, listNavigation()), []]
  }
  return [
    withNavigation(
      model,
      loadingFactNavigation(counterId, detailPresentationId, requestId),
    ),
    [
      FetchCounterFact({
        counterId,
        detailPresentationId,
        number: maybeCounter.value.counter.count,
        requestId,
      }),
    ],
  ]
}

const deleteNavigation = (
  model: Model,
  counterId: CounterId,
  confirmationId: DeleteCounterConfirmationId,
  detailPresentationId: CounterDetailPresentationId,
): Navigation => {
  if (Option.isNone(findCounter(model, counterId))) {
    return listNavigation()
  }
  return CounterDetail.make({
    counterId,
    maybeMode: Option.some(
      DeleteCounterConfirmation.make({
        confirmationId,
        detailPresentationId,
      }),
    ),
    presentationId: detailPresentationId,
  })
}

const openNavigation = (
  model: Model,
  opening: NavigationOpening,
): UpdateReturn =>
  M.value(opening).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      CounterListOpening: () => [withNavigation(model, listNavigation()), []],
      CounterDetailOpening: ({ presentationId, target }) => [
        withNavigation(
          model,
          normalizeNavigation(
            model,
            detailNavigation(target.counterId, presentationId),
          ),
        ),
        [],
      ],
      CounterFactOpening: ({ presentationId, requestId, target }) =>
        fetchFact(model, target.counterId, presentationId, requestId),
      DeleteCounterOpening: ({ confirmationId, presentationId, target }) => [
        withNavigation(
          model,
          deleteNavigation(
            model,
            target.counterId,
            confirmationId,
            presentationId,
          ),
        ),
        [],
      ],
    }),
  )

const addCounter = (model: Model, counterId: CounterId): UpdateReturn => {
  if (
    Option.isSome(findCounter(model, counterId)) ||
    Array.contains(model.retiredCounterIds, counterId) ||
    Array.length(model.rows) >= maximumCounterCount ||
    Array.length(model.rows) + Array.length(model.retiredCounterIds) >=
      maximumCounterIdentityCount
  ) {
    return [model, []]
  }
  const nextRows = Array.append(
    model.rows,
    CounterRow.make({
      id: counterId,
      counter: Counter.Model.make({ count: Counter.initialCount }),
    }),
  )
  return [Model.make({ ...model, rows: nextRows }), []]
}

const updateCounter = (
  model: Model,
  counterId: CounterId,
  message: Counter.Message,
): UpdateReturn => {
  const maybeCounter = findCounter(model, counterId)
  if (Option.isNone(maybeCounter)) {
    return [model, []]
  }

  const [nextCounter, commands] = Counter.update(
    maybeCounter.value.counter,
    message,
  )
  const nextRows = Array.map(model.rows, row => {
    if (row.id === counterId) {
      return CounterRow.make({ ...row, counter: nextCounter })
    } else {
      return row
    }
  })
  const nextModel = Model.make({ ...model, rows: nextRows })
  return [
    nextModel,
    Command.mapMessages(commands, childMessage =>
      GotCounterMessage({ counterId, message: childMessage }),
    ),
  ]
}

const selectCounter = (
  model: Model,
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
): UpdateReturn => {
  if (Option.isSome(findCounter(model, counterId))) {
    return [
      withNavigation(model, detailNavigation(counterId, detailPresentationId)),
      [],
    ]
  } else {
    return [model, []]
  }
}

const dismissCounterDetail = (
  model: Model,
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
): UpdateReturn => {
  if (
    model.navigation._tag === 'CounterDetail' &&
    model.navigation.counterId === counterId &&
    model.navigation.presentationId === detailPresentationId
  ) {
    return [withNavigation(model, listNavigation()), []]
  } else {
    return [model, []]
  }
}

const showCounterFact = (
  model: Model,
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
  requestId: CounterFactRequestId,
): UpdateReturn => {
  const navigation = model.navigation
  if (
    navigation._tag !== 'CounterDetail' ||
    navigation.counterId !== counterId ||
    navigation.presentationId !== detailPresentationId ||
    Option.isSome(navigation.maybeMode)
  ) {
    return [model, []]
  }
  return fetchFact(model, counterId, detailPresentationId, requestId)
}

const succeedFact = (
  model: Model,
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
  requestId: CounterFactRequestId,
  fact: CounterFact,
): UpdateReturn => {
  const navigation = model.navigation
  if (
    navigation._tag !== 'CounterDetail' ||
    navigation.counterId !== counterId ||
    navigation.presentationId !== detailPresentationId ||
    Option.isNone(navigation.maybeMode) ||
    navigation.maybeMode.value._tag !== 'CounterFactAlert' ||
    navigation.maybeMode.value.requestId !== requestId
  ) {
    return [model, []]
  }
  return [
    withNavigation(
      model,
      loadedFactNavigation(counterId, detailPresentationId, requestId, fact),
    ),
    [],
  ]
}

const failFact = (
  model: Model,
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
  requestId: CounterFactRequestId,
  reason: string,
): UpdateReturn => {
  const navigation = model.navigation
  if (
    navigation._tag !== 'CounterDetail' ||
    navigation.counterId !== counterId ||
    navigation.presentationId !== detailPresentationId ||
    Option.isNone(navigation.maybeMode) ||
    navigation.maybeMode.value._tag !== 'CounterFactAlert' ||
    navigation.maybeMode.value.requestId !== requestId
  ) {
    return [model, []]
  }
  return [
    withNavigation(
      model,
      failedFactNavigation(counterId, detailPresentationId, requestId, reason),
    ),
    [],
  ]
}

const dismissFact = (
  model: Model,
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
  requestId: CounterFactRequestId,
): UpdateReturn => {
  const navigation = model.navigation
  if (
    navigation._tag !== 'CounterDetail' ||
    navigation.counterId !== counterId ||
    navigation.presentationId !== detailPresentationId ||
    Option.isNone(navigation.maybeMode) ||
    navigation.maybeMode.value._tag !== 'CounterFactAlert' ||
    navigation.maybeMode.value.detailPresentationId !== detailPresentationId ||
    navigation.maybeMode.value.requestId !== requestId
  ) {
    return [model, []]
  }
  return [
    withNavigation(model, detailNavigation(counterId, detailPresentationId)),
    [],
  ]
}

const showDeleteConfirmation = (
  model: Model,
  counterId: CounterId,
  confirmationId: DeleteCounterConfirmationId,
  detailPresentationId: CounterDetailPresentationId,
): UpdateReturn => {
  const navigation = model.navigation
  if (Option.isNone(findCounter(model, counterId))) {
    return [model, []]
  }
  if (navigation._tag === 'CounterDetail') {
    if (
      navigation.counterId !== counterId ||
      navigation.presentationId !== detailPresentationId ||
      Option.isSome(navigation.maybeMode)
    ) {
      return [model, []]
    }
  }
  return [
    withNavigation(
      model,
      deleteNavigation(model, counterId, confirmationId, detailPresentationId),
    ),
    [],
  ]
}

const cancelDelete = (
  model: Model,
  counterId: CounterId,
  confirmationId: DeleteCounterConfirmationId,
  detailPresentationId: CounterDetailPresentationId,
): UpdateReturn => {
  const navigation = model.navigation
  if (
    navigation._tag !== 'CounterDetail' ||
    navigation.counterId !== counterId ||
    navigation.presentationId !== detailPresentationId ||
    Option.isNone(navigation.maybeMode) ||
    navigation.maybeMode.value._tag !== 'DeleteCounterConfirmation' ||
    navigation.maybeMode.value.detailPresentationId !== detailPresentationId ||
    navigation.maybeMode.value.confirmationId !== confirmationId
  ) {
    return [model, []]
  }
  return [
    withNavigation(model, detailNavigation(counterId, detailPresentationId)),
    [],
  ]
}

const confirmDelete = (model: Model, counterId: CounterId): UpdateReturn => {
  if (Option.isNone(findCounter(model, counterId))) {
    return [model, []]
  }
  const nextRetiredCounterIds = Array.append(model.retiredCounterIds, counterId)
  const nextRows = Array.filter(model.rows, row => row.id !== counterId)
  const nextNavigation =
    model.navigation._tag === 'CounterDetail' &&
    model.navigation.counterId === counterId
      ? listNavigation()
      : model.navigation
  return [
    Model.make({
      ...model,
      retiredCounterIds: nextRetiredCounterIds,
      rows: nextRows,
      navigation: nextNavigation,
    }),
    [],
  ]
}

/** Restores a valid semantic destination. Reloads an in-flight fact Command. */
export const restore = (model: Model): UpdateReturn => {
  const nextNavigation = normalizeNavigation(model, model.navigation)
  if (
    nextNavigation._tag !== 'CounterDetail' ||
    Option.isNone(nextNavigation.maybeMode) ||
    nextNavigation.maybeMode.value._tag !== 'CounterFactAlert' ||
    nextNavigation.maybeMode.value.status._tag !== 'LoadingCounterFact'
  ) {
    return [withNavigation(model, nextNavigation), []]
  }
  return fetchFact(
    withNavigation(model, nextNavigation),
    nextNavigation.counterId,
    nextNavigation.presentationId,
    nextNavigation.maybeMode.value.requestId,
  )
}

// UPDATE

/** Applies one Multiple Counters Message to the Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      ClickedAddCounter: ({ counterId }) => addCounter(model, counterId),
      GotCounterMessage: ({ counterId, message: childMessage }) =>
        updateCounter(model, counterId, childMessage),
      SelectedCounter: ({ counterId, detailPresentationId }) =>
        selectCounter(model, counterId, detailPresentationId),
      DismissedCounterDetail: ({ counterId, detailPresentationId }) =>
        dismissCounterDetail(model, counterId, detailPresentationId),
      ClickedShowCounterFact: ({
        counterId,
        detailPresentationId,
        requestId,
      }) => showCounterFact(model, counterId, detailPresentationId, requestId),
      SucceededLoadCounterFact: ({
        counterId,
        detailPresentationId,
        fact,
        requestId,
      }) =>
        succeedFact(model, counterId, detailPresentationId, requestId, fact),
      FailedLoadCounterFact: ({
        counterId,
        detailPresentationId,
        reason,
        requestId,
      }) => failFact(model, counterId, detailPresentationId, requestId, reason),
      DismissedCounterFactAlert: ({
        counterId,
        detailPresentationId,
        requestId,
      }) => dismissFact(model, counterId, detailPresentationId, requestId),
      ClickedDeleteCounter: ({
        confirmationId,
        counterId,
        detailPresentationId,
      }) =>
        showDeleteConfirmation(
          model,
          counterId,
          confirmationId,
          detailPresentationId,
        ),
      CancelledDeleteCounter: ({
        confirmationId,
        counterId,
        detailPresentationId,
      }) =>
        cancelDelete(model, counterId, confirmationId, detailPresentationId),
      ConfirmedDeleteCounter: ({ counterId }) =>
        confirmDelete(model, counterId),
      OpenedNavigation: ({ opening }) => openNavigation(model, opening),
    }),
  )
