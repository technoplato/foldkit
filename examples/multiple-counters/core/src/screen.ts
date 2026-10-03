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
import { entriesOf, listedEntries, shownEntries } from './entries.js'
import { type CounterRow, type Model, counterOf } from './model.js'

// VIEW

const entriesTagged = (
  entries: ReadonlyArray<Catalog.Entry>,
  tags: ReadonlyArray<string>,
): ReadonlyArray<Catalog.Entry> =>
  Array.filter(entries, entry => Array.contains(tags, entry.tag))

const counterLine = (row: CounterRow): UiNode =>
  Row(
    {},
    Text(counterName(row.counterId)),
    Text(row.counter.count.toString(), {
      label: `${counterName(row.counterId)} count ${row.counter.count.toString()}`,
    }),
    ...actionButtons(listedEntries(row)),
  )

/**
 * The list: every counter with its count and its buttons, `+`, `-`, a
 * Reset Disabled at 0, Open, and Delete, then Add counter. Its buttons
 * come from the same entries every other surface reads.
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
      onNonEmpty: rows => Array.map(rows, counterLine),
    }),
    Row({}, ...actionButtons(entriesTagged(entriesOf(model), ['AddCounter']))),
  )

/**
 * One counter's page: its name, then the Counter Program's own screen,
 * the same count and buttons the single Counter paints, then Delete.
 *
 * @example
 * ```typescript
 * detailScreen(row) // Column: Text('Counter 3'), counterScreen({ count: 5 }), [Delete]
 * ```
 */
export const detailScreen = (row: CounterRow): UiNode =>
  Column(
    {},
    Text(counterName(row.counterId), { dim: true }),
    counterScreen(row.counter),
    Row(
      {},
      ...actionButtons(entriesTagged(shownEntries(row), ['DeleteCounter'])),
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
 * The question "Delete Counter 3?": what goes, then Delete and Cancel.
 * Both buttons come from the list's entries, which offer them only while
 * this question is open.
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
        entriesTagged(entriesOf(model), [
          'ConfirmDeleteCounter',
          'CancelDeleteCounter',
        ]),
      ),
    ),
  )
