import { catalog as counterCatalog } from 'counter-core-example'
import { Array, Option, Schema as S } from 'effect'
import { Catalog, Navigation } from 'foldkit'

import { CounterId, CounterIdSegment, counterName } from './counterId.js'
import { type CounterRow, type Model, counterOf } from './model.js'
import { confirmingOf, shownOf } from './stack.js'

// MESSAGE

const answerFirst = 'answer the delete question first'

const unlessConfirming = (model: Model): Catalog.Availability =>
  Option.isSome(confirmingOf(model))
    ? Catalog.Disabled({ because: answerFirst })
    : Catalog.Enabled()

const onlyWhileConfirming = (model: Model): Catalog.Availability =>
  Option.isSome(confirmingOf(model))
    ? Catalog.Enabled()
    : Catalog.Disabled({ because: 'no delete is waiting for an answer' })

const whichCounter = (
  availabilityOf: (model: Model, row: CounterRow) => Catalog.Availability,
  preferredOf?: (model: Model) => Option.Option<CounterId>,
): Catalog.Choose<Model, 'counterId', CounterId> => ({
  field: 'counterId',
  prompt: 'Which counter?',
  token: CounterIdSegment,
  choicesOf: model =>
    Array.map(model.counters, row => ({
      value: row.counterId,
      title: counterName(row.counterId),
      detail: `count ${row.counter.count.toString()}`,
      availability: availabilityOf(model, row),
    })),
  ...(preferredOf === undefined ? {} : { preferredOf }),
  nothingToChoose: 'there are no counters yet',
})

const anyCounter = (): Catalog.Availability => Catalog.Enabled()

/** Adds a counter at the end of the list, starting at 0. `a` presses it. */
export const Add = Catalog.action('Add', {
  what: 'Adds a counter at the end of the list, starting at 0',
  why: 'The person wants another count',
  enabled: unlessConfirming,
  meta: { label: 'Add counter', keys: ['a'], title: 'Add counter' },
})

/**
 * The single Counter's own Actions, `Increment`, `Decrement`, and `Reset`,
 * lifted over the list: each keeps its tag, words, keys, and rule, and asks
 * which counter second. `+` on Counter 3's page counts Counter 3, and Reset
 * is offered for each counter not already at 0.
 */
export const counterActions = Catalog.lift(counterCatalog, {
  field: 'counterId',
  Id: CounterId,
  token: CounterIdSegment,
  prompt: 'Which counter?',
  rowsOf: (model: Model) =>
    Array.map(model.counters, row => ({
      id: row.counterId,
      title: counterName(row.counterId),
      detail: `count ${row.counter.count.toString()}`,
      model: row.counter,
    })),
  preferredOf: shownOf,
  enabled: unlessConfirming,
  nothingToChoose: 'there are no counters yet',
})

/**
 * Raises, lowers, and resets one counter: the single Counter's Increment,
 * Decrement, and Reset, lifted, so `Decrement({ counterId: 2 })` reaches
 * the Counter's own update as `Decrement()` for Counter 2.
 */
export const [Increment, Decrement, Reset] = counterActions.actions

/** Opens one counter on its own page. */
export const Open = Catalog.action('Open', {
  fields: { counterId: CounterId },
  choose: whichCounter((model, row) =>
    Option.contains(shownOf(model), row.counterId)
      ? Catalog.Disabled({ because: 'it is already open' })
      : Catalog.Enabled(),
  ),
  what: 'Opens the counter on its own page',
  why: 'The person wants to focus on one count',
  enabled: unlessConfirming,
  meta: { label: 'Open', keys: ['o'], title: 'Open counter' },
})

/** Asks whether to delete one counter. `d` presses it on its page. */
export const Delete = Catalog.action('Delete', {
  fields: { counterId: CounterId },
  choose: whichCounter(anyCounter, shownOf),
  what: 'Asks before deleting the counter',
  why: 'The person no longer needs this count',
  enabled: unlessConfirming,
  meta: { label: 'Delete', keys: ['d'], title: 'Delete counter' },
})

/**
 * Deletes the counter the open question names, on every device. Its one
 * choice is that counter, so no surface can delete a counter nobody was
 * asked about. `y` presses it.
 */
export const ConfirmDelete = Catalog.action('ConfirmDelete', {
  fields: { counterId: CounterId },
  choose: {
    field: 'counterId',
    prompt: 'Delete which counter?',
    token: CounterIdSegment,
    choicesOf: (model: Model) =>
      Array.map(
        Option.toArray(
          Option.flatMap(confirmingOf(model), counterId =>
            counterOf(model, counterId),
          ),
        ),
        row => ({ value: row.counterId, title: counterName(row.counterId) }),
      ),
    preferredOf: confirmingOf,
    nothingToChoose: 'no delete is waiting for an answer',
  },
  what: 'Deletes the counter the question names',
  why: 'The person is sure they want it gone',
  meta: { label: 'Delete', keys: ['y'] },
})

/** Closes the delete question and keeps the counter. `n` presses it. */
export const CancelDelete = Catalog.action('CancelDelete', {
  what: 'Closes the question and keeps the counter',
  why: 'The person changed their mind',
  enabled: onlyWhileConfirming,
  meta: { label: 'Cancel', keys: ['n'] },
})

/**
 * Every Multiple Counters Action in the order surfaces list them. The
 * action menu shows each once; the ones that act on one counter ask which
 * counter next. The CLI reads them as `counters decrement 2`.
 */
export const catalog = Catalog.make([
  Add,
  Increment,
  Decrement,
  Reset,
  Open,
  Delete,
  ConfirmDelete,
  CancelDelete,
])

/**
 * Every Message the Multiple Counters accept: the Catalog's Actions and
 * the carrier facts its stack folds.
 */
export const Message = S.Union([
  ...catalog.Message.members,
  Navigation.OpenedUri,
  Navigation.NavigatedBack,
])
/** A Multiple Counters Message value. */
export type Message = typeof Message.Type
