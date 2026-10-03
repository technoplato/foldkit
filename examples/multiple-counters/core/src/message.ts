import { Decrement, Increment, Reset } from 'counter-core-example'
import { Option, Schema as S } from 'effect'
import { Catalog, Navigation } from 'foldkit'
import { m } from 'foldkit/message'

import { CounterId } from './counterId.js'
import { confirmingOf } from './stack.js'

// MESSAGE

type HasStack = Parameters<typeof confirmingOf>[0]

const answerFirst = 'answer the delete question first'

const unlessConfirming = (model: HasStack): Catalog.Availability =>
  Option.isSome(confirmingOf(model))
    ? Catalog.Disabled({ because: answerFirst })
    : Catalog.Enabled()

const onlyWhileConfirming = (model: HasStack): Catalog.Availability =>
  Option.isSome(confirmingOf(model))
    ? Catalog.Enabled()
    : Catalog.Disabled({ because: 'no delete is waiting for an answer' })

/** Adds a counter at the end of the list, starting at 0. `a` presses it. */
export const AddCounter = Catalog.action('AddCounter', {
  what: 'Adds a counter at the end of the list, starting at 0',
  why: 'The person wants another count',
  enabled: unlessConfirming,
  meta: { label: 'Add counter', keys: ['a'] },
})

/**
 * Deletes the counter the open question names, on every device. It is
 * offered only while that question is open, and the interaction fills in
 * the number from it, so no surface can delete a counter nobody was asked
 * about. `y` presses it.
 */
export const ConfirmDeleteCounter = Catalog.action('ConfirmDeleteCounter', {
  fields: { counterId: CounterId },
  what: 'Deletes the counter the question names',
  why: 'The person is sure they want it gone',
  enabled: onlyWhileConfirming,
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
 * The Actions of the list as a whole. Buttons, keys, the action menu, and
 * CLI commands all derive from it.
 */
export const catalog = Catalog.make([
  AddCounter,
  ConfirmDeleteCounter,
  CancelDeleteCounter,
])

/** Opens one counter on its own page. */
export const OpenCounter = Catalog.action('OpenCounter', {
  what: 'Opens the counter on its own page',
  why: 'The person wants to focus on one count',
  meta: { label: 'Open', keys: ['o'] },
})

/** Asks whether to delete one counter. `d` presses it on its page. */
export const DeleteCounter = Catalog.action('DeleteCounter', {
  what: 'Asks before deleting the counter',
  why: 'The person no longer needs this count',
  meta: { label: 'Delete', keys: ['d'] },
})

/**
 * What one counter can do: the Counter Program's own Actions, with the
 * same keys and the same Disabled Reset at 0, then Open and Delete. Every
 * row presses these against its own count.
 */
export const rowCatalog = Catalog.make([
  Increment,
  Decrement,
  Reset,
  OpenCounter,
  DeleteCounter,
])

/** One row Action: a Counter Action, Open, or Delete. */
export type RowAction = typeof rowCatalog.Message.Type

/** A row Action reached counter `counterId`. */
export const GotCounterMessage = m('GotCounterMessage', {
  counterId: CounterId,
  message: rowCatalog.Message,
})
/** A row Action reached counter `counterId`. */
export type GotCounterMessage = typeof GotCounterMessage.Type

/**
 * Every Message the Multiple Counters accept: the list's Actions, one
 * row's Action, and the carrier facts its stack folds.
 */
export const Message = S.Union([
  AddCounter,
  ConfirmDeleteCounter,
  CancelDeleteCounter,
  GotCounterMessage,
  Navigation.OpenedUri,
  Navigation.NavigatedBack,
])
/** A Multiple Counters Message value. */
export type Message = typeof Message.Type
