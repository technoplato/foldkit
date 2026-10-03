import { counterScreen } from 'counter-core-example'
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
import { Add, CancelDelete, ConfirmDelete, Delete, catalog } from './message.js'
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

const countText = (row: CounterRow): UiNode =>
  Text(row.counter.count.toString(), {
    label: `${counterName(row.counterId)} count ${row.counter.count.toString()}`,
  })

const counterLine = (model: Model, row: CounterRow): UiNode =>
  Row(
    {},
    Text(counterName(row.counterId)),
    countText(row),
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
        entriesTagged(Catalog.entries(catalog, model), [Add.tag]),
      ),
    ),
  )

/**
 * One counter's page: its name, then the single Counter's own screen, the
 * same count and `+`, `-`, and Reset the Counter paints, then Delete. The
 * Counter's buttons press `Increment`, `Decrement`, and `Reset`, which the
 * lifted Actions take for the counter on screen.
 *
 * @example
 * ```typescript
 * detailScreen(model, row) // Column: Text('Counter 3'), counterScreen({ count: 5 }), [Delete]
 * ```
 */
export const detailScreen = (model: Model, row: CounterRow): UiNode =>
  Column(
    {},
    Text(counterName(row.counterId), { dim: true }),
    counterScreen(row.counter),
    Row(
      {},
      ...actionButtons(
        entriesTagged(forCounter(model, row.counterId), [
          Catalog.choiceTagOf(Delete.tag, row.counterId.toString()),
        ]),
      ),
    ),
  )

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
          ConfirmDelete.tag,
          CancelDelete.tag,
        ]),
      ),
    ),
  )
