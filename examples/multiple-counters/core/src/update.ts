import {
  update as counterUpdate,
  init as initCounter,
} from 'counter-core-example'
import { Array, Match as M, Option } from 'effect'
import { Navigation } from 'foldkit'
import type * as Command from 'foldkit/command'

import { CounterId } from './counterId.js'
import {
  ConfirmDelete,
  CounterDetail,
  type Destination,
  isConfirmDelete,
  namesCounter,
} from './destination.js'
import type { Message, RowAction } from './message.js'
import { type CounterRow, type Model, counterOf } from './model.js'
import { navigation } from './navigation.js'

// UPDATE

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const hasCounter = (model: Model, counterId: CounterId): boolean =>
  Option.isSome(counterOf(model, counterId))

const addedCounter = (model: Model): Model => {
  const [counter] = initCounter()
  return {
    ...model,
    counters: Array.append(model.counters, {
      counterId: model.nextCounterId,
      counter,
    }),
    nextCounterId: CounterId.make(model.nextCounterId + 1),
  }
}

const withStack = (
  model: Model,
  stack: Navigation.NavigationStack<Destination>,
): Model => ({ ...model, navigation: stack })

/**
 * The counter's page, right above the list: a page never sits above
 * another counter's page.
 */
const openedCounter = (model: Model, counterId: CounterId): Model =>
  hasCounter(model, counterId)
    ? withStack(
        model,
        Navigation.pushed(
          { ...model.navigation, pages: [] },
          Navigation.presented<Destination>(
            CounterDetail({ counterId }),
            Navigation.Push(),
          ),
        ),
      )
    : model

/**
 * The question "Delete Counter 3?" as the one modal. While another modal
 * is open, the stack refuses a second, so nothing changes.
 */
const askedToDelete = (model: Model, counterId: CounterId): Model =>
  hasCounter(model, counterId)
    ? withStack(
        model,
        Navigation.pushed(
          model.navigation,
          Navigation.presented<Destination>(
            ConfirmDelete({ counterId }),
            Navigation.Dialog(),
          ),
        ),
      )
    : model

/**
 * The list without the counter, and the stack without every page and
 * question that named it, on every device that folds the deletion.
 */
const deletedCounter = (model: Model, counterId: CounterId): Model => ({
  ...model,
  counters: Array.filter(model.counters, row => row.counterId !== counterId),
  navigation: Navigation.withoutDestinations(model.navigation, destination =>
    namesCounter(destination, counterId),
  ),
})

const closedQuestion = (model: Model): Model =>
  withStack(
    model,
    Navigation.withoutDestinations(model.navigation, isConfirmDelete),
  )

const withCounter = (
  model: Model,
  counterId: CounterId,
  next: (row: CounterRow) => CounterRow,
): Model => ({
  ...model,
  counters: Array.map(model.counters, row =>
    row.counterId === counterId ? next(row) : row,
  ),
})

const countedBy = (
  model: Model,
  counterId: CounterId,
  action: Parameters<typeof counterUpdate>[1],
): Model =>
  withCounter(model, counterId, row => ({
    ...row,
    counter: counterUpdate(row.counter, action)[0],
  }))

const rowUpdate = (
  model: Model,
  counterId: CounterId,
  action: RowAction,
): Model =>
  M.value(action).pipe(
    M.withReturnType<Model>(),
    M.tagsExhaustive({
      Increment: increment => countedBy(model, counterId, increment),
      Decrement: decrement => countedBy(model, counterId, decrement),
      Reset: reset => countedBy(model, counterId, reset),
      OpenCounter: () => openedCounter(model, counterId),
      DeleteCounter: () => askedToDelete(model, counterId),
    }),
  )

/**
 * Applies one Multiple Counters Message. A row Action for a counter that
 * no longer exists changes nothing, since another device may have
 * deleted it first.
 */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      AddCounter: () => [addedCounter(model), []],
      ConfirmDeleteCounter: ({ counterId }) => [
        deletedCounter(model, counterId),
        [],
      ],
      CancelDeleteCounter: () => [closedQuestion(model), []],
      GotCounterMessage: ({ counterId, message: rowMessage }) => [
        rowUpdate(model, counterId, rowMessage),
        [],
      ],
      OpenedUri: fact => [Navigation.foldMessage(navigation, model, fact), []],
      NavigatedBack: fact => [
        Navigation.foldMessage(navigation, model, fact),
        [],
      ],
    }),
  )
