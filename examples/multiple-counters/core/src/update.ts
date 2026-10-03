import {
  update as counterUpdate,
  init as initCounter,
} from 'counter-core-example'
import { Array, Match as M, Option } from 'effect'
import { Navigation } from 'foldkit'
import type * as Command from 'foldkit/command'

import { CounterId } from './counterId.js'
import {
  CounterDetail,
  DeleteQuestion,
  type Destination,
  isDeleteQuestion,
  namesCounter,
} from './destination.js'
import { type Message, counterActions } from './message.js'
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
            DeleteQuestion({ counterId }),
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
    Navigation.withoutDestinations(model.navigation, isDeleteQuestion),
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
  counterMessage: Parameters<typeof counterUpdate>[1],
): Model =>
  withCounter(model, counterId, row => ({
    ...row,
    counter: counterUpdate(row.counter, counterMessage)[0],
  }))

const counted = (model: Model, message: Readonly<{ _tag: string }>): Model =>
  Option.match(counterActions.childOf(message), {
    onNone: () => model,
    onSome: ({ id, message: counterMessage }) =>
      countedBy(model, id, counterMessage),
  })

/**
 * Applies one Multiple Counters Message. Counting reads the lifted
 * Message back as the single Counter's own and hands it to the Counter's
 * own update for that one counter.
 * An Action for a counter that no longer exists changes nothing, since
 * another device may have deleted it first.
 */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      Add: () => [addedCounter(model), []],
      Increment: increment => [counted(model, increment), []],
      Decrement: decrement => [counted(model, decrement), []],
      Reset: reset => [counted(model, reset), []],
      Open: ({ counterId }) => [openedCounter(model, counterId), []],
      Delete: ({ counterId }) => [askedToDelete(model, counterId), []],
      ConfirmDelete: ({ counterId }) => [deletedCounter(model, counterId), []],
      CancelDelete: () => [closedQuestion(model), []],
      OpenedUri: fact => [Navigation.foldMessage(navigation, model, fact), []],
      NavigatedBack: fact => [
        Navigation.foldMessage(navigation, model, fact),
        [],
      ],
    }),
  )
