import { Array, Option } from 'effect'
import { Catalog } from 'foldkit'
import {
  type ButtonNode,
  Column,
  List,
  type ListItem,
  Text,
  type UiNode,
  actionButtons,
} from 'foldkit/renderers'

import { ImportFromAudible, ShowAddBooks } from './addBooks.js'
import { catalog } from './message.js'
import type { Model } from './model.js'

// SOURCES

/**
 * One place a family member's books can come from: its name, what it
 * brings in, and the Action that starts it, such as Audible and
 * ImportFromAudible. A second source is one more entry in
 * {@link bookSources}; the Sheet and the empty library follow.
 */
export type BookSource = Readonly<{
  key: string
  name: string
  line: string
  action: Readonly<{ tag: string }>
}>

/** Every place books can come from, in the order the Sheet lists them. */
export const bookSources: ReadonlyArray<BookSource> = [
  {
    key: 'audible',
    name: 'Audible',
    line: 'Import the books you own',
    action: ImportFromAudible,
  },
]

const entriesOf = (model: Model): ReadonlyArray<Catalog.Entry> =>
  Catalog.entries(catalog, model)

const isOffered = (model: Model, tag: string): boolean =>
  Option.isSome(Catalog.messageFor(catalog, model, tag))

const sourceItemOf = (model: Model, source: BookSource): ListItem => ({
  key: source.key,
  title: source.name,
  lines: [source.line],
  ...(isOffered(model, source.action.tag) ? { action: source.action.tag } : {}),
})

/**
 * Where more books can come from, the Sheet at `/books/add`: one row per
 * source, and pressing a row starts it. Today that is Audible, "Import
 * the books you own".
 *
 * @example
 * ```typescript
 * addBooksScreen(model)
 * // Column: Add your books, [Audible · Import the books you own]
 * ```
 */
export const addBooksScreen = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    Text('Add your books', { emphasis: 'Headline' }),
    Text('Bring in the audiobooks you already own.'),
    List({
      label: 'Where your books are',
      items: Array.map(bookSources, source => sourceItemOf(model, source)),
    }),
  )

const primaryButtonsOf = (
  model: Model,
  tag: string,
): ReadonlyArray<ButtonNode> =>
  Array.map(
    actionButtons(Array.filter(entriesOf(model), entry => entry.tag === tag)),
    button => ({ ...button, variant: 'Primary' }),
  )

/**
 * The button an empty library offers: the one source's own, "Import from
 * Audible", while there is one source, and the Sheet of them once there
 * are more.
 */
export const emptyLibraryButtonsOf = (
  model: Model,
): ReadonlyArray<ButtonNode> =>
  Array.match(bookSources, {
    onEmpty: () => [],
    onNonEmpty: sources => {
      if (sources.length === 1) {
        return primaryButtonsOf(model, Array.headNonEmpty(sources).action.tag)
      } else {
        return primaryButtonsOf(model, ShowAddBooks.tag)
      }
    },
  })
