import { Array, Option, Schema as S } from 'effect'
import { Catalog, Interaction } from 'foldkit'

import { type CounterId, CounterIdSegment } from './counterId.js'
import { entriesOf } from './entries.js'
import {
  AddCounter,
  CancelDeleteCounter,
  ConfirmDeleteCounter,
  GotCounterMessage,
  type Message,
  rowCatalog,
} from './message.js'
import type { Model } from './model.js'
import { confirmingOf, shownOf } from './stack.js'

// INTERACTION

const counterIdOfRow = S.decodeUnknownOption(CounterIdSegment)

const rowActionFor = (
  tag: string,
  counterId: CounterId,
): Option.Option<Message> =>
  Option.map(
    Option.filter(
      Catalog.find(rowCatalog, tag),
      declaration => declaration.isPayloadFree,
    ),
    declaration =>
      GotCounterMessage({ counterId, message: declaration.make({}) }),
  )

const rowMessageOf = (model: Model, tag: string): Option.Option<Message> =>
  Option.orElse(
    Option.flatMap(Catalog.parseRowTag(tag), row =>
      Option.flatMap(counterIdOfRow(row.rowId), counterId =>
        rowActionFor(row.tag, counterId),
      ),
    ),
    () =>
      Option.flatMap(shownOf(model), counterId => rowActionFor(tag, counterId)),
  )

const messageOf = (model: Model, tag: string): Option.Option<Message> => {
  if (tag === AddCounter.tag) {
    return Option.some(AddCounter())
  } else if (tag === ConfirmDeleteCounter.tag) {
    return Option.map(confirmingOf(model), counterId =>
      ConfirmDeleteCounter({ counterId }),
    )
  } else if (tag === CancelDeleteCounter.tag) {
    return Option.some(CancelDeleteCounter())
  } else {
    return rowMessageOf(model, tag)
  }
}

const isEnabledIn = (model: Model, tag: string): boolean =>
  Array.some(
    entriesOf(model),
    entry => entry.tag === tag && Catalog.isEnabled(entry.availability),
  )

/**
 * The Message one press sends, or none when that Action is not offered
 * right now. `Increment:3` reaches Counter 3 from the list; a bare
 * `Increment` reaches the counter whose page is open; Delete in the
 * question takes its number from the question.
 *
 * @example
 * ```typescript
 * pressOf(model, 'Increment:3') // [GotCounterMessage({ counterId: 3, message: Increment() })]
 * pressOf(confirming3, 'ConfirmDeleteCounter') // [ConfirmDeleteCounter({ counterId: 3 })]
 * pressOf(confirming3, 'Increment:1') // []: the question is open
 * ```
 */
export const pressOf = (model: Model, tag: string): ReadonlyArray<Message> =>
  isEnabledIn(model, tag) ? Array.fromOption(messageOf(model, tag)) : []

/**
 * How every surface drives the Multiple Counters: the entries, a press by
 * tag, and a key, which presses whichever offered entry owns it, so `+`
 * counts on a counter's page and `y` answers the question. The action
 * menu and the session add their own on top.
 */
export const interaction: Interaction.ProgramInteraction<Model, Message> = {
  menuTitle: Option.none(),
  menuKeys: [],
  status: () => Interaction.Ready(),
  entries: entriesOf,
  press: pressOf,
  pressKey: (model, input) =>
    Option.match(Interaction.keyedEntryOf(entriesOf(model), input), {
      onNone: () => [],
      onSome: entry => pressOf(model, entry.tag),
    }),
  menu: () => Option.none(),
  openMenu: () => [],
  dismissMenu: () => [],
  typeInMenu: () => [],
  chooseFromMenu: () => [],
}
