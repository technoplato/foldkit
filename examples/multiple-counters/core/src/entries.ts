import { Array, Option, pipe } from 'effect'
import { Catalog } from 'foldkit'

import { type CounterId, counterName } from './counterId.js'
import { catalog, rowCatalog } from './message.js'
import type { CounterRow, Model } from './model.js'
import { confirmingOf, shownOf } from './stack.js'

// ENTRIES

const answerFirst = 'answer the delete question first'

const alreadyOpen = 'it is already open'

const rowOf = (row: CounterRow): Catalog.Row<CounterRow['counter']> => ({
  id: row.counterId.toString(),
  name: counterName(row.counterId).toLowerCase(),
  model: row.counter,
})

const withAvailability = (
  entry: Catalog.Entry,
  availability: Catalog.Availability,
): Catalog.Entry => ({ ...entry, availability })

const disabledBecause =
  (because: string) =>
  (entry: Catalog.Entry): Catalog.Entry =>
    withAvailability(entry, Catalog.Disabled({ because }))

/**
 * One counter's Actions on its own page: the Counter's bare tags, `+` and
 * all, since the page shows only this counter, titled for it. Open is
 * Disabled there, because the page is already open.
 *
 * @example
 * ```typescript
 * shownEntries(row) // [Increment (+ =), Decrement (-), Reset (r), Open (Disabled), Delete (d)]
 * ```
 */
export const shownEntries = (row: CounterRow): ReadonlyArray<Catalog.Entry> =>
  Array.map(Catalog.entries(rowCatalog, row.counter), entry => {
    const titled = {
      ...entry,
      title: `${entry.title} ${counterName(row.counterId).toLowerCase()}`,
    }
    return entry.tag === 'OpenCounter'
      ? disabledBecause(alreadyOpen)(titled)
      : titled
  })

/**
 * One counter's Actions in the list, tagged for its row, `Increment:3`.
 * Rows share keys, so these carry none.
 */
export const listedEntries = (row: CounterRow): ReadonlyArray<Catalog.Entry> =>
  Catalog.rowEntries(rowCatalog, rowOf(row))

const counterEntries = (
  model: Model,
  maybeShown: Option.Option<CounterId>,
): ReadonlyArray<Catalog.Entry> =>
  Array.flatMap(model.counters, row =>
    Option.contains(maybeShown, row.counterId)
      ? shownEntries(row)
      : listedEntries(row),
  )

/**
 * Every Action the Multiple Counters offer right now, the one list every
 * surface reads: the list's own Actions, then each counter's. While a
 * delete question is open, everything but its answers says why it waits,
 * so a CLI or an agent cannot press behind the dialog either.
 *
 * @example
 * ```typescript
 * entriesOf(model).map(entry => entry.tag)
 * // ['AddCounter', 'ConfirmDeleteCounter', 'CancelDeleteCounter',
 * //  'Increment:1', 'Decrement:1', 'Reset:1', 'OpenCounter:1', 'DeleteCounter:1']
 * ```
 */
export const entriesOf = (model: Model): ReadonlyArray<Catalog.Entry> => {
  const listEntries = Catalog.entries(catalog, model)
  const rows = counterEntries(model, shownOf(model))
  return Option.match(confirmingOf(model), {
    onNone: () => [...listEntries, ...rows],
    onSome: () => [
      ...listEntries,
      ...pipe(rows, Array.map(disabledBecause(answerFirst))),
    ],
  })
}
