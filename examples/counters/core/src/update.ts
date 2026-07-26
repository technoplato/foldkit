import * as Counter from 'counter-core-example'
import { Array, Effect, Match as M, Option } from 'effect'
import { Command } from 'foldkit'

import { CounterFactClient } from './counterFactClient.js'
import {
  FailedFetchCounterFact,
  GotCounterMessage,
  type Message,
  SucceededFetchCounterFact,
} from './message.js'
import {
  CounterDetail,
  CounterFactAlert,
  CounterList,
  CounterRow,
  DeleteCounterConfirmation,
  FailedCounterFact,
  LoadedCounterFact,
  LoadingCounterFact,
  Model,
  type Navigation,
} from './model.js'

// COMMAND

/** Fetches one fact for a specific Counter Submodel value. */
export const FetchCounterFact = Command.define(
  'FetchCounterFact',
  { counterId: CounterRow.fields.id, number: Counter.Model.fields.count },
  SucceededFetchCounterFact,
  FailedFetchCounterFact,
)(({ counterId, number }) =>
  Effect.flatMap(CounterFactClient, client =>
    client.fetch(number).pipe(
      Effect.map(fact => SucceededFetchCounterFact({ counterId, fact })),
      Effect.catch(error =>
        Effect.succeed(
          FailedFetchCounterFact({ counterId, reason: error.reason }),
        ),
      ),
    ),
  ),
)

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, CounterFactClient>>,
]

const findCounter = (model: Model, counterId: string) =>
  Array.findFirst(model.rows, row => row.id === counterId)

const listNavigation = () => CounterList.make({})

const detailNavigation = (counterId: string) =>
  CounterDetail.make({ counterId, maybeMode: Option.none() })

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

const fetchForNavigation = (
  model: Model,
  navigation: Navigation,
): ReadonlyArray<Command.Command<Message, never, CounterFactClient>> => {
  if (navigation._tag !== 'CounterDetail') {
    return []
  }
  if (Option.isNone(navigation.maybeMode)) {
    return []
  }
  if (navigation.maybeMode.value._tag !== 'CounterFactAlert') {
    return []
  }
  if (navigation.maybeMode.value.status._tag !== 'LoadingCounterFact') {
    return []
  }
  const maybeCounter = findCounter(model, navigation.counterId)
  if (Option.isNone(maybeCounter)) {
    return []
  }
  return [
    FetchCounterFact({
      counterId: navigation.counterId,
      number: maybeCounter.value.counter.count,
    }),
  ]
}

const openNavigation = (model: Model, navigation: Navigation): UpdateReturn => {
  const nextNavigation = normalizeNavigation(model, navigation)
  const nextModel = withNavigation(model, nextNavigation)
  return [nextModel, fetchForNavigation(nextModel, nextNavigation)]
}

const updateCounter = (
  model: Model,
  counterId: string,
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

const showCounterFact = (model: Model): UpdateReturn => {
  const navigation = model.navigation
  if (navigation._tag !== 'CounterDetail') {
    return [model, []]
  }
  if (Option.isSome(navigation.maybeMode)) {
    return [model, []]
  }
  const maybeCounter = findCounter(model, navigation.counterId)
  if (Option.isNone(maybeCounter)) {
    return [model, []]
  }

  const nextNavigation = CounterDetail.make({
    counterId: navigation.counterId,
    maybeMode: Option.some(
      CounterFactAlert.make({ status: LoadingCounterFact.make({}) }),
    ),
  })
  return [
    withNavigation(model, nextNavigation),
    [
      FetchCounterFact({
        counterId: navigation.counterId,
        number: maybeCounter.value.counter.count,
      }),
    ],
  ]
}

const finishCounterFact = (
  model: Model,
  counterId: string,
  status: typeof LoadedCounterFact.Type | typeof FailedCounterFact.Type,
): UpdateReturn => {
  const navigation = model.navigation
  if (
    navigation._tag !== 'CounterDetail' ||
    navigation.counterId !== counterId ||
    Option.isNone(navigation.maybeMode) ||
    navigation.maybeMode.value._tag !== 'CounterFactAlert'
  ) {
    return [model, []]
  }

  const nextNavigation = CounterDetail.make({
    counterId,
    maybeMode: Option.some(CounterFactAlert.make({ status })),
  })
  return [withNavigation(model, nextNavigation), []]
}

const dismissFact = (model: Model): UpdateReturn => {
  const navigation = model.navigation
  if (
    navigation._tag !== 'CounterDetail' ||
    Option.isNone(navigation.maybeMode) ||
    navigation.maybeMode.value._tag !== 'CounterFactAlert'
  ) {
    return [model, []]
  }
  return [withNavigation(model, detailNavigation(navigation.counterId)), []]
}

const showDeleteConfirmation = (model: Model): UpdateReturn => {
  const navigation = model.navigation
  if (
    navigation._tag !== 'CounterDetail' ||
    Option.isSome(navigation.maybeMode)
  ) {
    return [model, []]
  }
  const nextNavigation = CounterDetail.make({
    counterId: navigation.counterId,
    maybeMode: Option.some(DeleteCounterConfirmation.make({})),
  })
  return [withNavigation(model, nextNavigation), []]
}

const cancelDelete = (model: Model): UpdateReturn => {
  const navigation = model.navigation
  if (
    navigation._tag !== 'CounterDetail' ||
    Option.isNone(navigation.maybeMode) ||
    navigation.maybeMode.value._tag !== 'DeleteCounterConfirmation'
  ) {
    return [model, []]
  }
  return [withNavigation(model, detailNavigation(navigation.counterId)), []]
}

const confirmDelete = (model: Model): UpdateReturn => {
  const navigation = model.navigation
  if (
    navigation._tag !== 'CounterDetail' ||
    Option.isNone(navigation.maybeMode) ||
    navigation.maybeMode.value._tag !== 'DeleteCounterConfirmation'
  ) {
    return [model, []]
  }
  const nextRows = Array.filter(
    model.rows,
    row => row.id !== navigation.counterId,
  )
  return [
    Model.make({
      ...model,
      rows: nextRows,
      navigation: listNavigation(),
    }),
    [],
  ]
}

/** Restores pending destination work when a host starts from a Model. */
export const restore = (model: Model): UpdateReturn => {
  const nextNavigation = normalizeNavigation(model, model.navigation)
  const nextModel = withNavigation(model, nextNavigation)
  return [nextModel, fetchForNavigation(nextModel, nextNavigation)]
}

// UPDATE

/** Applies one Multiple Counters Message to the Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      ClickedAddCounter: () => {
        const counterId = `counter-${model.nextCounterNumber.toString()}`
        const nextRows = Array.append(
          model.rows,
          CounterRow.make({
            id: counterId,
            counter: Counter.Model.make({ count: Counter.initialCount }),
          }),
        )
        return [
          Model.make({
            ...model,
            rows: nextRows,
            nextCounterNumber: model.nextCounterNumber + 1,
          }),
          [],
        ]
      },
      GotCounterMessage: ({ counterId, message: childMessage }) =>
        updateCounter(model, counterId, childMessage),
      SelectedCounter: ({ counterId }) => {
        if (Option.isSome(findCounter(model, counterId))) {
          return [withNavigation(model, detailNavigation(counterId)), []]
        } else {
          return [model, []]
        }
      },
      DismissedCounterDetail: () => [
        withNavigation(model, listNavigation()),
        [],
      ],
      ClickedShowCounterFact: () => showCounterFact(model),
      SucceededFetchCounterFact: ({ counterId, fact }) =>
        finishCounterFact(model, counterId, LoadedCounterFact.make({ fact })),
      FailedFetchCounterFact: ({ counterId, reason }) =>
        finishCounterFact(model, counterId, FailedCounterFact.make({ reason })),
      DismissedCounterFactAlert: () => dismissFact(model),
      ClickedDeleteCounter: () => showDeleteConfirmation(model),
      CancelledDeleteCounter: () => cancelDelete(model),
      ConfirmedDeleteCounter: () => confirmDelete(model),
      OpenedNavigation: ({ navigation }) => openNavigation(model, navigation),
    }),
  )
