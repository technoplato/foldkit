import {
  type Model as CounterModel,
  Decrement,
  Increment,
  Reset,
} from 'counter-core-example'
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

const asTheCounterAllows =
  (
    counterAction: Readonly<{
      enabled: (model: CounterModel) => Catalog.Availability
    }>,
  ) =>
  (_model: Model, row: CounterRow): Catalog.Availability =>
    counterAction.enabled(row.counter)

const anyCounter = (): Catalog.Availability => Catalog.Enabled()

/** Adds a counter at the end of the list, starting at 0. `a` presses it. */
export const AddCounter = Catalog.action('AddCounter', {
  what: 'Adds a counter at the end of the list, starting at 0',
  why: 'The person wants another count',
  enabled: unlessConfirming,
  meta: { label: 'Add counter', keys: ['a'] },
})

/**
 * Raises one counter by one. It is the single Counter's Increment, with
 * its words and keys, asked of one counter: the menu offers it once and
 * then asks which counter, and on a counter's page `+` counts that one.
 */
export const IncrementCounter = Catalog.action('IncrementCounter', {
  fields: { counterId: CounterId },
  choose: whichCounter(asTheCounterAllows(Increment), shownOf),
  what: Increment.what,
  why: Increment.why,
  enabled: unlessConfirming,
  meta: Increment.meta,
})

/** Lowers one counter by one, the single Counter's Decrement. */
export const DecrementCounter = Catalog.action('DecrementCounter', {
  fields: { counterId: CounterId },
  choose: whichCounter(asTheCounterAllows(Decrement), shownOf),
  what: Decrement.what,
  why: Decrement.why,
  enabled: unlessConfirming,
  meta: Decrement.meta,
})

/**
 * Sets one counter back to 0, the single Counter's Reset, offered for each
 * counter that is not already at 0.
 */
export const ResetCounter = Catalog.action('ResetCounter', {
  fields: { counterId: CounterId },
  choose: whichCounter(asTheCounterAllows(Reset), shownOf),
  what: Reset.what,
  why: Reset.why,
  enabled: unlessConfirming,
  meta: Reset.meta,
})

/** Opens one counter on its own page. */
export const OpenCounter = Catalog.action('OpenCounter', {
  fields: { counterId: CounterId },
  choose: whichCounter((model, row) =>
    Option.contains(shownOf(model), row.counterId)
      ? Catalog.Disabled({ because: 'it is already open' })
      : Catalog.Enabled(),
  ),
  what: 'Opens the counter on its own page',
  why: 'The person wants to focus on one count',
  enabled: unlessConfirming,
  meta: { label: 'Open', keys: [] },
})

/** Asks whether to delete one counter. `d` presses it on its page. */
export const DeleteCounter = Catalog.action('DeleteCounter', {
  fields: { counterId: CounterId },
  choose: whichCounter(anyCounter, shownOf),
  what: 'Asks before deleting the counter',
  why: 'The person no longer needs this count',
  enabled: unlessConfirming,
  meta: { label: 'Delete', keys: ['d'] },
})

/**
 * Deletes the counter the open question names, on every device. Its one
 * choice is that counter, so no surface can delete a counter nobody was
 * asked about. `y` presses it.
 */
export const ConfirmDeleteCounter = Catalog.action('ConfirmDeleteCounter', {
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
export const CancelDeleteCounter = Catalog.action('CancelDeleteCounter', {
  what: 'Closes the question and keeps the counter',
  why: 'The person changed their mind',
  enabled: onlyWhileConfirming,
  meta: { label: 'Cancel', keys: ['n'] },
})

/**
 * Every Multiple Counters Action in the order surfaces list them. The
 * action menu shows each once; the five that act on one counter ask which
 * counter next.
 */
export const catalog = Catalog.make([
  AddCounter,
  IncrementCounter,
  DecrementCounter,
  ResetCounter,
  OpenCounter,
  DeleteCounter,
  ConfirmDeleteCounter,
  CancelDeleteCounter,
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
