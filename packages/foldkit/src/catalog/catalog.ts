import { Array, Option, Schema as S, String, pipe } from 'effect'

import { type CallableTaggedStruct, callableWith, ts } from '../schema/index.js'

// AVAILABILITY

/** The Action can be sent from the current Model. */
export const Enabled = ts('Enabled')
/** The Action can be sent from the current Model. */
export type Enabled = typeof Enabled.Type

/**
 * The Action cannot be sent from the current Model. `because` is the one
 * sentence every surface shows: the disabled button's description, the
 * dimmed menu row, and the CLI refusal.
 *
 * @example
 * ```typescript
 * Disabled({ because: 'count is already 0' })
 * ```
 */
export const Disabled = ts('Disabled', { because: S.String })
/** The Action cannot be sent from the current Model. */
export type Disabled = typeof Disabled.Type

/** Whether one Action can be sent from the current Model. */
export const Availability = S.Union([Enabled, Disabled])
/** Whether one Action can be sent from the current Model. */
export type Availability = typeof Availability.Type

/** True when an Action can be sent. */
export const isEnabled = (availability: Availability): boolean =>
  availability._tag === 'Enabled'

const alwaysEnabled = (): Availability => Enabled()

// DECLARATION

/**
 * How surfaces present an Action. `label` is the button text and menu row.
 * `keys` are the keyboard shortcuts. update never reads this.
 *
 * @example
 * ```typescript
 * const meta: ActionMeta = { label: '+', keys: ['+', '='] }
 * ```
 */
export type ActionMeta = Readonly<{
  label: string
  keys: ReadonlyArray<string>
}>

/** The declaration an Action carries beside its Message constructor. */
export type ActionDeclaration<Tag extends string, Model> = Readonly<{
  tag: Tag
  what: string
  why: string
  enabled: (model: Model) => Availability
  meta: ActionMeta
  isPayloadFree: boolean
}>

/**
 * One declared Action. Calling it builds the Message; its properties are the
 * declaration every surface derives from.
 *
 * @example
 * ```typescript
 * Increment() // { _tag: 'Increment' }
 * Increment.meta.keys // ['+', '=']
 * ```
 */
export type Action<
  Tag extends string,
  Fields extends S.Struct.Fields,
  Model,
> = CallableTaggedStruct<Tag, Fields> & ActionDeclaration<Tag, Model>

/** The semantic and presentation halves of one Action declaration. */
export type ActionConfig<Model> = Readonly<{
  what: string
  why: string
  enabled?: (model: Model) => Availability
  meta: ActionMeta
}>

/**
 * Declares one Action: a Message a person, key, menu, or agent can cause on
 * purpose. The tag is the identity; there is no separate token. `enabled`
 * defaults to always Enabled.
 *
 * @example
 * ```typescript
 * const Reset = Catalog.action('Reset', {
 *   what: 'Sets the count to 0',
 *   why: 'The person wants to start over',
 *   enabled: (model: Model) =>
 *     model.count === 0
 *       ? Catalog.Disabled({ because: 'count is already 0' })
 *       : Catalog.Enabled(),
 *   meta: { label: 'Reset', keys: ['r'] },
 * })
 * ```
 */
export function action<Tag extends string, Model = unknown>(
  tag: Tag,
  config: ActionConfig<Model>,
): Action<Tag, {}, Model>
export function action<
  Tag extends string,
  Fields extends S.Struct.Fields,
  Model = unknown,
>(
  tag: Tag,
  config: ActionConfig<Model> & Readonly<{ fields: Fields }>,
): Action<Tag, Fields, Model>
export function action(
  tag: string,
  config: ActionConfig<any> & Readonly<{ fields?: S.Struct.Fields }>,
): any {
  const fields = config.fields ?? {}
  return callableWith(S.TaggedStruct(tag, fields), {
    tag,
    what: config.what,
    why: config.why,
    enabled: config.enabled ?? alwaysEnabled,
    meta: config.meta,
    isPayloadFree: Array.isReadonlyArrayEmpty(Object.keys(fields)),
  })
}

// CATALOG

/**
 * Any declared Action, with or without fields. Structural so a Catalog can
 * mix `Increment()` and `SetCount({ count })`.
 */
export type AnyAction = S.Top &
  ActionDeclaration<string, any> &
  Readonly<{ make: (input: any) => any }>

/**
 * The single ordered value of every Action a Program offers. Buttons, menu
 * rows, keyboard maps, and CLI commands all derive from it.
 *
 * @example
 * ```typescript
 * const catalog = Catalog.make([Increment, Decrement, Reset])
 * ```
 */
export type Catalog<Actions extends Array.NonEmptyReadonlyArray<AnyAction>> =
  Readonly<{
    actions: Actions
    Message: S.Union<Actions>
  }>

/** Any Catalog. */
export type AnyCatalog = Catalog<Array.NonEmptyReadonlyArray<AnyAction>>

/** One Action of a Catalog. */
export type ActionOf<C extends AnyCatalog> = C['actions'][number]

/** The tag union of a Catalog. */
export type TagOf<C extends AnyCatalog> = ActionOf<C>['tag']

/** The Message union of a Catalog. */
export type MessageOf<C extends AnyCatalog> = C['Message']['Type']

type IntersectModels<Actions> = (
  Actions extends ActionDeclaration<string, infer Model>
    ? (model: Model) => void
    : never
) extends (model: infer Intersection) => void
  ? Intersection
  : never

/** The Model every Action of a Catalog can read. */
export type ModelOf<C extends AnyCatalog> = IntersectModels<ActionOf<C>>

/**
 * The exact Catalog a Program declares, kept through composition, so typed
 * hooks know its Actions.
 *
 * @example
 * ```typescript
 * type CounterCatalog = CatalogOf<typeof SyncedCounter>
 * // Catalog<readonly [typeof Increment, typeof Decrement, typeof Reset]>
 * ```
 */
export type CatalogOf<Definition> =
  Definition extends Readonly<{ catalog: infer C extends AnyCatalog }>
    ? C
    : never

/**
 * The `catalog` field a composed Program carries from its child: the child's
 * exact Catalog, or nothing when the child declares none.
 */
export type CatalogCarrierOf<Child> =
  Child extends Readonly<{ catalog: infer C extends AnyCatalog }>
    ? Readonly<{ catalog: C }>
    : unknown

/** Builds a Catalog from Actions in the order surfaces list them. */
export const make = <
  const Actions extends Array.NonEmptyReadonlyArray<AnyAction>,
>(
  actions: Actions,
): Catalog<Actions> => ({
  actions,
  Message: S.Union(actions),
})

// ENTRY

/**
 * One Action as every surface sees it for the current Model.
 *
 * @example
 * ```typescript
 * // count is 0
 * Catalog.entries(catalog, model)
 * // [..., { tag: 'Reset', label: 'Reset', keys: ['r'],
 * //   availability: Disabled({ because: 'count is already 0' }), ... }]
 * ```
 */
export type Entry<Tag extends string = string> = Readonly<{
  tag: Tag
  title: string
  what: string
  why: string
  label: string
  keys: ReadonlyArray<string>
  availability: Availability
  isPayloadFree: boolean
}>

/** Projects one Action declaration against the current Model. */
export const entryOf = <Tag extends string, Model>(
  declaration: ActionDeclaration<Tag, Model>,
  model: Model,
): Entry<Tag> => ({
  tag: declaration.tag,
  title: titleOf(declaration.tag),
  what: declaration.what,
  why: declaration.why,
  label: declaration.meta.label,
  keys: declaration.meta.keys,
  availability: declaration.enabled(model),
  isPayloadFree: declaration.isPayloadFree,
})

/** Projects every Action of a Catalog against the current Model, in order. */
export const entries = <C extends AnyCatalog>(
  catalog: C,
  model: ModelOf<C>,
): ReadonlyArray<Entry<TagOf<C>>> =>
  Array.map(catalog.actions, declaration => entryOf(declaration, model))

// LOOKUP

/** Finds the Action with this tag. */
export const find = <C extends AnyCatalog>(
  catalog: C,
  tag: string,
): Option.Option<ActionOf<C>> =>
  Array.findFirst(catalog.actions, declaration => declaration.tag === tag)

/** Finds the Action whose `meta.keys` include this key. */
export const findByKey = <C extends AnyCatalog>(
  catalog: C,
  key: string,
): Option.Option<ActionOf<C>> =>
  Array.findFirst(catalog.actions, declaration =>
    Array.contains(declaration.meta.keys, key),
  )

const rowSeparator = ':'

/**
 * The CLI word for a tag, derived rather than declared. A row Action's
 * tag reads as the word, then the row.
 *
 * @example
 * ```typescript
 * Catalog.commandOf('Increment') // 'increment'
 * Catalog.commandOf('ResetCount') // 'reset-count'
 * Catalog.commandOf('Increment:3') // 'increment 3'
 * ```
 */
export const commandOf = (tag: string): string =>
  Option.match(String.indexOf(rowSeparator)(tag), {
    onNone: () => wordOf(tag),
    onSome: index => `${wordOf(tag.slice(0, index))} ${tag.slice(index + 1)}`,
  })

const wordOf = (tag: string): string =>
  pipe(tag, String.pascalToSnake, String.snakeToKebab)

/** Finds the Action whose derived CLI word is `command`. */
export const findByCommand = <C extends AnyCatalog>(
  catalog: C,
  command: string,
): Option.Option<ActionOf<C>> =>
  Array.findFirst(
    catalog.actions,
    declaration => commandOf(declaration.tag) === command,
  )

/**
 * Builds the Message for a payload-free Action that is Enabled for `model`.
 * None when the Action is unknown, needs fields, or is Disabled.
 *
 * @example
 * ```typescript
 * Catalog.messageFor(catalog, { count: 3 }, 'Reset') // Some(Reset())
 * Catalog.messageFor(catalog, { count: 0 }, 'Reset') // None
 * ```
 */
export const messageFor = <C extends AnyCatalog>(
  catalog: C,
  model: ModelOf<C>,
  tag: string,
): Option.Option<MessageOf<C>> =>
  pipe(
    find(catalog, tag),
    Option.filter(
      declaration =>
        declaration.isPayloadFree && isEnabled(declaration.enabled(model)),
    ),
    Option.map(declaration => declaration.make({})),
  )

// TITLE

const isAcronym = (word: string): boolean =>
  word.length > 1 && word === word.toUpperCase()

/**
 * An Action's tag as words, the title a menu row or a terminal Button
 * shows.
 *
 * @example
 * ```typescript
 * titleOf('OpenSessionSettings') // 'Open session settings'
 * titleOf('OpenURL') // 'Open URL'
 * ```
 */
export const titleOf = (tag: string): string =>
  pipe(
    tag,
    String.replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
    String.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'),
    String.split(' '),
    Array.map((word, index) =>
      index === 0 || isAcronym(word) ? word : word.toLowerCase(),
    ),
    Array.join(' '),
  )

// ROWS

/**
 * One row of a list a row Catalog acts on: the id its tags carry, the name
 * its titles read, and the row's own Model.
 *
 * @example
 * ```typescript
 * const row: Catalog.Row<CounterModel> = { id: '3', name: 'counter 3', model: { count: 5 } }
 * ```
 */
export type Row<Model> = Readonly<{ id: string; name: string; model: Model }>

/**
 * The tag a row's Action presses: the Action's tag, then the row.
 *
 * @example
 * ```typescript
 * Catalog.rowTagOf('Increment', '3') // 'Increment:3'
 * ```
 */
export const rowTagOf = (tag: string, rowId: string): string =>
  `${tag}${rowSeparator}${rowId}`

/**
 * The Action tag and row a row tag names. None for a tag with no row.
 *
 * @example
 * ```typescript
 * Catalog.parseRowTag('Increment:3') // Some({ tag: 'Increment', rowId: '3' })
 * Catalog.parseRowTag('Increment') // None
 * ```
 */
export const parseRowTag = (
  rowTag: string,
): Option.Option<Readonly<{ tag: string; rowId: string }>> =>
  pipe(
    String.indexOf(rowSeparator)(rowTag),
    Option.filter(index => index > 0 && index < rowTag.length - 1),
    Option.map(index => ({
      tag: rowTag.slice(0, index),
      rowId: rowTag.slice(index + 1),
    })),
  )

/**
 * A row Catalog's entries for one row: each Action against the row's own
 * Model, so a Disabled Reset says why for that row alone, tagged and
 * titled for the row. Many rows share one key, so the entries carry keys
 * only when `hasKeys` says this row owns them, such as the row a detail
 * page shows.
 *
 * @example
 * ```typescript
 * Catalog.rowEntries(counterCatalog, { id: '3', name: 'counter 3', model: { count: 0 } })
 * // [{ tag: 'Increment:3', title: 'Increment counter 3', keys: [], ... },
 * //  { tag: 'Reset:3', availability: Disabled('count is already 0'), ... }]
 * ```
 */
export const rowEntries = <C extends AnyCatalog>(
  catalog: C,
  row: Row<ModelOf<C>>,
  options: Readonly<{ hasKeys?: boolean }> = {},
): ReadonlyArray<Entry> =>
  Array.map(entries(catalog, row.model), entry => ({
    ...entry,
    tag: rowTagOf(entry.tag, row.id),
    title: `${entry.title} ${row.name}`,
    keys: options.hasKeys === true ? entry.keys : [],
  }))
