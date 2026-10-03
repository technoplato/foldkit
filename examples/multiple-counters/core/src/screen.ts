import { Array, Option, pipe } from 'effect'
import { Catalog } from 'foldkit'
import {
  Column,
  Row,
  Text,
  type UiNode,
  actionButtons,
} from 'foldkit/renderers'

import { type CounterId, counterName } from './counterId.js'
import {
  AddCounter,
  CancelDeleteCounter,
  ConfirmDeleteCounter,
  DecrementCounter,
  DeleteCounter,
  IncrementCounter,
  ResetCounter,
  catalog,
} from './message.js'
import { type CounterRow, type Model, counterOf } from './model.js'

// VIEW

const entriesTagged = (
  entries: ReadonlyArray<Catalog.Entry>,
  tags: ReadonlyArray<string>,
): ReadonlyArray<Catalog.Entry> =>
  Array.filter(entries, entry => Array.contains(tags, entry.tag))

const forCounter = (
  model: Model,
  counterId: CounterId,
): ReadonlyArray<Catalog.Entry> =>
  Catalog.entriesFor(Catalog.entries(catalog, model), counterId.toString())

const countText = (row: CounterRow, isDisplay: boolean): UiNode =>
  Text(row.counter.count.toString(), {
    label: `${counterName(row.counterId)} count ${row.counter.count.toString()}`,
    ...(isDisplay ? { emphasis: 'Display' } : {}),
  })

const counterLine = (model: Model, row: CounterRow): UiNode =>
  Row(
    {},
    Text(counterName(row.counterId)),
    countText(row, false),
    ...actionButtons(forCounter(model, row.counterId)),
  )

/**
 * The list: every counter with its count and its buttons, `+`, `-`, a
 * Reset Disabled at 0, Open, and Delete, then Add counter. Each row's
 * buttons are the Catalog's choosing Actions for that counter.
 *
 * @example
 * ```typescript
 * listScreen(model)
 * // Column: Text('Counters'), Row: Counter 1  0  [+] [-] [Reset] [Open] [Delete], [Add counter]
 * ```
 */
export const listScreen = (model: Model): UiNode =>
  Column(
    {},
    Text('Counters', { emphasis: 'Display' }),
    ...Array.match(model.counters, {
      onEmpty: () => [
        Text('No counters yet. Add one to start counting.', { dim: true }),
      ],
      onNonEmpty: rows => Array.map(rows, row => counterLine(model, row)),
    }),
    Row(
      {},
      ...actionButtons(
        entriesTagged(Catalog.entries(catalog, model), [AddCounter.tag]),
      ),
    ),
  )

/**
 * One counter's page: its name, its count large, the counting buttons,
 * then Delete. Its keys are the single Counter's, `+`, `-`, and `r`,
 * because the page's counter is every Action's preferred choice.
 *
 * @example
 * ```typescript
 * detailScreen(model, row) // Column: Text('Counter 3'), Text('5'), [+] [-] [Reset], [Delete]
 * ```
 */
export const detailScreen = (model: Model, row: CounterRow): UiNode => {
  const entries = forCounter(model, row.counterId)
  const choiceTagsOf = (tags: ReadonlyArray<string>): ReadonlyArray<string> =>
    Array.map(tags, tag => Catalog.choiceTagOf(tag, row.counterId.toString()))
  return Column(
    {},
    Text(counterName(row.counterId), { dim: true }),
    countText(row, true),
    Row(
      {},
      ...actionButtons(
        entriesTagged(
          entries,
          choiceTagsOf([
            IncrementCounter.tag,
            DecrementCounter.tag,
            ResetCounter.tag,
          ]),
        ),
      ),
    ),
    Row(
      {},
      ...actionButtons(
        entriesTagged(entries, choiceTagsOf([DeleteCounter.tag])),
      ),
    ),
  )
}

/**
 * The page for a counter that is not in the list, because another device
 * deleted it or a URI named one that never existed.
 */
export const missingScreen = (counterId: CounterId): UiNode =>
  Column(
    {},
    Text(`${counterName(counterId)} is not in the list`),
    Text('Another device may have deleted it. Go back to the list.', {
      dim: true,
    }),
  )

/**
 * The question "Delete Counter 3?": what goes, then Delete and Cancel,
 * which the Catalog offers only while this question is open.
 *
 * @example
 * ```typescript
 * confirmScreen(model, 3) // Column: Text('Delete Counter 3?'), [Delete] [Cancel]
 * ```
 */
export const confirmScreen = (model: Model, counterId: CounterId): UiNode =>
  Column(
    {},
    Text(`Delete ${counterName(counterId)}?`),
    Text(
      pipe(
        counterOf(model, counterId),
        Option.match({
          onNone: () => 'It is already gone.',
          onSome: row =>
            `Its count, ${row.counter.count.toString()}, goes with it on every device.`,
        }),
      ),
      { dim: true },
    ),
    Row(
      {},
      ...actionButtons(
        entriesTagged(Catalog.entries(catalog, model), [
          ConfirmDeleteCounter.tag,
          CancelDeleteCounter.tag,
        ]),
      ),
    ),
  )
