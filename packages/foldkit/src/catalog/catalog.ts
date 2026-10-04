import {
  Array,
  Option,
  Predicate,
  Record,
  Schema as S,
  String,
  pipe,
} from 'effect'

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
 * How surfaces present an Action. `label` is the button text. `keys` are
 * the keyboard shortcuts. `title` names the menu row when the tag's words
 * are too short, `Add counter` for `Add`; the CLI word still comes from
 * the tag. update never reads this.
 *
 * @example
 * ```typescript
 * const meta: ActionMeta = { label: '+', keys: ['+', '='] }
 * ```
 */
export type ActionMeta = Readonly<{
  label: string
  keys: ReadonlyArray<string>
  title?: string
}>

/**
 * One value a choosing Action can take right now: the value, how a person
 * reads it, what sets it apart, and whether it is offered. Availability
 * defaults to Enabled, and the detail to the Action's `what`.
 *
 * @example
 * ```typescript
 * const choice: Catalog.Choice<CounterId> = { value: 3, title: 'Counter 3', detail: 'count 5' }
 * ```
 */
export type Choice<Value> = Readonly<{
  value: Value
  title: string
  detail?: string
  availability?: Availability
}>

/**
 * How a choosing Action picks the value its one field takes. The Action is
 * one entry everywhere, and the person picks the value second: the menu
 * opens a nested step, a button presses one value, the CLI takes it as a
 * word. `token` prints a value as one word, `3`, for press tags, CLI
 * commands, and URIs. `preferredOf` is the value a bare press or key takes,
 * such as the counter whose page is open. `nothingToChoose` is the sentence
 * when there are no choices. `accepts` makes the choice open: a value no
 * choice lists is still taken when its token decodes and `accepts` allows
 * it, such as any place in a book for a seek bar, while `choicesOf` lists
 * the ones worth offering, the chapter starts.
 *
 * @example
 * ```typescript
 * const choose: Catalog.Choose<Model, 'counterId', CounterId> = {
 *   field: 'counterId',
 *   prompt: 'Which counter?',
 *   token: CounterIdSegment,
 *   choicesOf: model => model.counters.map(row => ({ value: row.counterId, title: `Counter ${row.counterId}` })),
 *   preferredOf: shownOf,
 *   nothingToChoose: 'there are no counters yet',
 * }
 * ```
 */
export type Choose<Model, Field extends string, Value> = Readonly<{
  field: Field
  prompt: string
  token: S.Codec<Value, string>
  choicesOf: (model: Model) => ReadonlyArray<Choice<Value>>
  preferredOf?: (model: Model) => Option.Option<Value>
  accepts?: (model: Model, value: Value) => Availability
  nothingToChoose: string
}>

/** One choice as every surface reads it, its value printed as a token. */
export type EntryChoice = Readonly<{
  token: string
  title: string
  maybeDetail: Option.Option<string>
  availability: Availability
}>

/** A Choose with its value printed, as a declaration keeps it. */
export type ChooseDeclaration<Model> = Readonly<{
  field: string
  prompt: string
  nothingToChoose: string
  choicesOf: (model: Model) => ReadonlyArray<EntryChoice>
  preferredOf: (model: Model) => Option.Option<string>
  valueOf: (token: string) => Option.Option<unknown>
  isOpen: boolean
  acceptsOf: (model: Model, token: string) => Option.Option<Availability>
}>

/** The declaration an Action carries beside its Message constructor. */
export type ActionDeclaration<Tag extends string, Model> = Readonly<{
  tag: Tag
  what: string
  why: string
  enabled: (model: Model) => Availability
  meta: ActionMeta
  isPayloadFree: boolean
  maybeChoose: Option.Option<ChooseDeclaration<Model>>
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
  Field extends keyof Fields & string,
  Model = unknown,
>(
  tag: Tag,
  config: ActionConfig<Model> &
    Readonly<{
      fields: Fields
      choose: Choose<Model, Field, Fields[Field]['Type']>
    }>,
): Action<Tag, Fields, Model>
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
  config: ActionConfig<any> &
    Readonly<{
      fields?: S.Struct.Fields
      choose?: Choose<any, string, any>
    }>,
): any {
  const fields = config.fields ?? {}
  return callableWith(S.TaggedStruct(tag, fields), {
    tag,
    what: config.what,
    why: config.why,
    enabled: config.enabled ?? alwaysEnabled,
    meta: config.meta,
    isPayloadFree: Array.isReadonlyArrayEmpty(Object.keys(fields)),
    maybeChoose: Option.map(Option.fromNullishOr(config.choose), chooseOf),
  })
}

const chooseOf = <Model, Value>(
  choose: Choose<Model, string, Value>,
): ChooseDeclaration<Model> => {
  const printToken = S.encodeSync(choose.token)
  return {
    field: choose.field,
    prompt: choose.prompt,
    nothingToChoose: choose.nothingToChoose,
    choicesOf: model =>
      Array.map(choose.choicesOf(model), choice => ({
        token: printToken(choice.value),
        title: choice.title,
        maybeDetail: Option.fromNullishOr(choice.detail),
        availability: choice.availability ?? Enabled(),
      })),
    preferredOf: model =>
      Option.map(
        choose.preferredOf === undefined
          ? Option.none()
          : choose.preferredOf(model),
        printToken,
      ),
    valueOf: S.decodeUnknownOption(choose.token),
    isOpen: choose.accepts !== undefined,
    acceptsOf: (model, token) =>
      Option.flatMap(Option.fromNullishOr(choose.accepts), accepts =>
        Option.map(S.decodeUnknownOption(choose.token)(token), value =>
          accepts(model, value),
        ),
      ),
  }
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
  maybeChoices: Option.Option<EntryChoices>
}>

/**
 * What a choosing entry offers: the field it fills, the question, each
 * choice with its own availability, the choice a bare press takes, and the
 * keys the Action declares. A bare key takes the preferred choice, and a
 * terminal acts with it on the highlighted row: `r` on Counter 2's row
 * resets Counter 2. `isOpen` says the Action also takes values the choices
 * do not list, such as any place on a seek bar.
 *
 * @example
 * ```typescript
 * // two counters, Counter 1 at 0, Counter 2's page open
 * Option.getOrThrow(resetEntry.maybeChoices)
 * // { field: 'counterId', prompt: 'Which counter?', maybePreferred: Some('2'), keys: ['r'],
 * //   choices: [{ token: '1', title: 'Counter 1', availability: Disabled('count is already 0') },
 * //             { token: '2', title: 'Counter 2', availability: Enabled() }] }
 * ```
 */
export type EntryChoices = Readonly<{
  field: string
  prompt: string
  choices: ReadonlyArray<EntryChoice>
  maybePreferred: Option.Option<string>
  keys: ReadonlyArray<string>
  isOpen: boolean
}>

const summarized = (
  choices: ReadonlyArray<EntryChoice>,
  nothingToChoose: string,
): Availability =>
  Option.match(Array.head(choices), {
    onNone: () => Disabled({ because: nothingToChoose }),
    onSome: first =>
      Array.some(choices, choice => isEnabled(choice.availability))
        ? Enabled()
        : first.availability,
  })

const choicesEntryOf = <Model>(
  declaration: ActionDeclaration<string, Model>,
  choose: ChooseDeclaration<Model>,
  model: Model,
): Pick<Entry, 'availability' | 'keys' | 'maybeChoices'> => {
  const actionAvailability = declaration.enabled(model)
  const choices = Array.map(choose.choicesOf(model), choice =>
    isEnabled(actionAvailability)
      ? choice
      : { ...choice, availability: actionAvailability },
  )
  const maybePreferred = Option.filter(choose.preferredOf(model), token =>
    Array.some(choices, choice => choice.token === token),
  )
  return {
    availability:
      isEnabled(actionAvailability) && !choose.isOpen
        ? summarized(choices, choose.nothingToChoose)
        : actionAvailability,
    keys: Option.isSome(maybePreferred) ? declaration.meta.keys : [],
    maybeChoices: Option.some({
      field: choose.field,
      prompt: choose.prompt,
      choices,
      maybePreferred,
      keys: declaration.meta.keys,
      isOpen: choose.isOpen,
    }),
  }
}

/**
 * Projects one Action declaration against the current Model. A choosing
 * Action is Enabled while any choice is, and carries its keys only while
 * it has a preferred choice for them to press.
 */
export const entryOf = <Tag extends string, Model>(
  declaration: ActionDeclaration<Tag, Model>,
  model: Model,
): Entry<Tag> => ({
  tag: declaration.tag,
  title: declaration.meta.title ?? titleOf(declaration.tag),
  what: declaration.what,
  why: declaration.why,
  label: declaration.meta.label,
  isPayloadFree: declaration.isPayloadFree,
  ...Option.match(declaration.maybeChoose, {
    onNone: () => ({
      keys: declaration.meta.keys,
      availability: declaration.enabled(model),
      maybeChoices: Option.none(),
    }),
    onSome: choose => choicesEntryOf(declaration, choose, model),
  }),
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

const choiceSeparator = ':'

/**
 * The CLI word for a tag, derived rather than declared. A choice tag reads
 * as the Action's word, then the choice.
 *
 * @example
 * ```typescript
 * Catalog.commandOf('Increment') // 'increment'
 * Catalog.commandOf('ResetCount') // 'reset-count'
 * Catalog.commandOf('DecrementCounter:3') // 'decrement-counter 3'
 * ```
 */
export const commandOf = (tag: string): string =>
  Option.match(String.indexOf(choiceSeparator)(tag), {
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

const chosenOf = <C extends AnyCatalog>(
  catalog: C,
  model: ModelOf<C>,
  tag: string,
): Option.Option<Readonly<{ declaration: ActionOf<C>; token: string }>> => {
  const choosing = (actionTag: string) =>
    Option.filter(find(catalog, actionTag), declaration =>
      Option.isSome(declaration.maybeChoose),
    )
  return Option.orElse(
    Option.flatMap(parseChoiceTag(tag), parsed =>
      Option.map(choosing(parsed.tag), declaration => ({
        declaration,
        token: parsed.token,
      })),
    ),
    () =>
      Option.flatMap(choosing(tag), declaration =>
        Option.flatMap(
          Option.flatMap(
            entryOf(declaration, model).maybeChoices,
            choices => choices.maybePreferred,
          ),
          token => Option.some({ declaration, token }),
        ),
      ),
  )
}

const choiceMessageFor = <C extends AnyCatalog>(
  catalog: C,
  model: ModelOf<C>,
  tag: string,
): Option.Option<MessageOf<C>> =>
  Option.flatMap(chosenOf(catalog, model, tag), ({ declaration, token }) =>
    Option.flatMap(declaration.maybeChoose, choose => {
      const isOffered = Option.exists(
        entryOf(declaration, model).maybeChoices,
        choices =>
          Array.some(
            choices.choices,
            choice => choice.token === token && isEnabled(choice.availability),
          ),
      )
      const isAccepted =
        isEnabled(declaration.enabled(model)) &&
        Option.exists(choose.acceptsOf(model, token), isEnabled)
      return isOffered || isAccepted
        ? Option.map(choose.valueOf(token), value =>
            declaration.make({ [choose.field]: value }),
          )
        : Option.none()
    }),
  )

/**
 * Builds the Message an Enabled Action sends for `model`: a payload-free
 * Action by its tag, a choosing Action by a choice tag, or by its bare tag
 * when it has a preferred choice. None when the Action is unknown, needs
 * other fields, or is Disabled.
 *
 * @example
 * ```typescript
 * Catalog.messageFor(catalog, { count: 3 }, 'Reset') // Some(Reset())
 * Catalog.messageFor(catalog, { count: 0 }, 'Reset') // None
 * Catalog.messageFor(catalog, model, 'DecrementCounter:2') // Some(DecrementCounter({ counterId: 2 }))
 * Catalog.messageFor(catalog, onCounter2Page, 'DecrementCounter') // Some(DecrementCounter({ counterId: 2 }))
 * ```
 */
export const messageFor = <C extends AnyCatalog>(
  catalog: C,
  model: ModelOf<C>,
  tag: string,
): Option.Option<MessageOf<C>> =>
  Option.orElse(
    pipe(
      find(catalog, tag),
      Option.filter(
        declaration =>
          declaration.isPayloadFree && isEnabled(declaration.enabled(model)),
      ),
      Option.map(declaration => declaration.make({})),
    ),
    () => choiceMessageFor(catalog, model, tag),
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

// CHOICES

/**
 * The tag that presses a choosing Action with one choice: the Action's
 * tag, then the choice's token.
 *
 * @example
 * ```typescript
 * Catalog.choiceTagOf('DecrementCounter', '2') // 'DecrementCounter:2'
 * ```
 */
export const choiceTagOf = (tag: string, token: string): string =>
  `${tag}${choiceSeparator}${token}`

/**
 * The Action tag and choice token a choice tag names. None for a tag with
 * no choice.
 *
 * @example
 * ```typescript
 * Catalog.parseChoiceTag('DecrementCounter:2') // Some({ tag: 'DecrementCounter', token: '2' })
 * Catalog.parseChoiceTag('DecrementCounter') // None
 * ```
 */
export const parseChoiceTag = (
  choiceTag: string,
): Option.Option<Readonly<{ tag: string; token: string }>> =>
  pipe(
    String.indexOf(choiceSeparator)(choiceTag),
    Option.filter(index => index > 0 && index < choiceTag.length - 1),
    Option.map(index => ({
      tag: choiceTag.slice(0, index),
      token: choiceTag.slice(index + 1),
    })),
  )

/**
 * Each choice of a choosing entry as an entry of its own, the rows of the
 * menu's nested step: titled by the choice, described by the Action, and
 * pressing the choice tag.
 *
 * @example
 * ```typescript
 * Catalog.choicesAsEntries(decrementEntry)
 * // [{ tag: 'DecrementCounter:1', title: 'Counter 1', what: 'count 0', ... }, ...]
 * ```
 */
export const choicesAsEntries = (entry: Entry): ReadonlyArray<Entry> =>
  Option.match(entry.maybeChoices, {
    onNone: () => [],
    onSome: ({ choices }) =>
      Array.map(choices, choice => ({
        ...entry,
        tag: choiceTagOf(entry.tag, choice.token),
        title: choice.title,
        what: Option.getOrElse(choice.maybeDetail, () => entry.what),
        label: choice.title,
        keys: [],
        availability: choice.availability,
        isPayloadFree: true,
        maybeChoices: Option.none(),
      })),
  })

/**
 * The entries one choice offers, for a screen that shows that choice, such
 * as a counter's row: every choosing entry that has `token`, pressing it
 * with that choice, with the Action's own label and, for the preferred
 * choice, its keys.
 *
 * @example
 * ```typescript
 * actionButtons(Catalog.entriesFor(Catalog.entries(catalog, model), '2'))
 * // [+] [-] [Reset] [Open] [Delete] for Counter 2
 * ```
 */
export const entriesFor = (
  catalogEntries: ReadonlyArray<Entry>,
  token: string,
): ReadonlyArray<Entry> =>
  Array.flatMap(catalogEntries, entry =>
    Option.match(entry.maybeChoices, {
      onNone: () => [],
      onSome: ({ choices, maybePreferred }) =>
        Array.map(
          Array.filter(choices, choice => choice.token === token),
          choice => ({
            ...entry,
            tag: choiceTagOf(entry.tag, token),
            availability: choice.availability,
            keys: Option.contains(maybePreferred, token) ? entry.keys : [],
            isPayloadFree: true,
            maybeChoices: Option.none(),
          }),
        ),
    }),
  )

// LIFT

/**
 * One row a lifted Catalog acts on: its id, how a person reads it, what
 * sets it apart, and the child Program's Model for that row.
 *
 * @example
 * ```typescript
 * { id: 3, title: 'Counter 3', detail: 'count 5', model: { count: 5 } }
 * ```
 */
export type LiftedRow<Id, ChildModel> = Readonly<{
  id: Id
  title: string
  detail?: string
  model: ChildModel
}>

/**
 * How a child Catalog is lifted over a list: the field each lifted Action
 * fills with the row's id, how an id prints as one word, the question, the
 * rows the parent Model holds, the row a bare press takes, and when the
 * parent offers the Actions at all.
 */
export type LiftConfig<
  Model,
  ChildModel,
  Field extends string,
  IdSchema extends S.Top,
> = Readonly<{
  field: Field
  Id: IdSchema
  token: S.Codec<IdSchema['Type'], string>
  prompt: string
  rowsOf: (
    model: Model,
  ) => ReadonlyArray<LiftedRow<IdSchema['Type'], ChildModel>>
  preferredOf?: (model: Model) => Option.Option<IdSchema['Type']>
  enabled?: (model: Model) => Availability
  nothingToChoose: string
}>

/** One child Action lifted over a list: the same tag, and the row's id. */
export type LiftedAction<
  Child extends AnyAction,
  Field extends string,
  IdSchema extends S.Top,
  Model,
> = Action<Child['tag'], Record<Field, IdSchema>, Model>

/** Every Action of a child Catalog, lifted over a list. */
export type LiftedActions<
  Actions extends Array.NonEmptyReadonlyArray<AnyAction>,
  Field extends string,
  IdSchema extends S.Top,
  Model,
> = {
  readonly [K in keyof Actions]: LiftedAction<
    Actions[K],
    Field,
    IdSchema,
    Model
  >
}

/**
 * A child Program's Catalog lifted over a list of rows, so a parent that
 * holds many children offers each child Action once. `Increment` stays
 * `Increment`, with the child's words, keys, and rule, and asks which row
 * second: its choices are the rows, each offered as the child's own
 * `enabled` says for that row. `childOf` reads a lifted Message back as
 * the row's id and the child's own Message, for the child's update.
 *
 * @example
 * ```typescript
 * const counterActions = Catalog.lift(CounterCatalog, {
 *   field: 'counterId',
 *   Id: CounterId,
 *   token: CounterIdSegment,
 *   prompt: 'Which counter?',
 *   rowsOf: model => model.counters.map(row => ({ id: row.counterId, title: `Counter ${row.counterId}`, model: row.counter })),
 *   preferredOf: shownOf,
 *   nothingToChoose: 'there are no counters yet',
 * })
 * counterActions.actions // [Increment, Decrement, Reset], each with { counterId }
 * counterActions.childOf(Decrement({ counterId: 2 })) // Some({ id: 2, message: Decrement() })
 * ```
 */
export const lift = <
  const Actions extends Array.NonEmptyReadonlyArray<AnyAction>,
  Model,
  Field extends string,
  IdSchema extends S.Top,
>(
  child: Catalog<Actions>,
  config: LiftConfig<Model, ModelOf<Catalog<Actions>>, Field, IdSchema>,
): Readonly<{
  actions: LiftedActions<Actions, Field, IdSchema, Model>
  childOf: (message: Readonly<{ _tag: string }>) => Option.Option<
    Readonly<{
      id: IdSchema['Type']
      message: MessageOf<Catalog<Actions>>
    }>
  >
}> => {
  const liftOne = (declaration: AnyAction): AnyAction =>
    action(declaration.tag, {
      fields: Record.singleton(config.field, config.Id),
      choose: {
        field: config.field,
        prompt: config.prompt,
        token: config.token,
        choicesOf: (model: Model) =>
          Array.map(config.rowsOf(model), row => ({
            value: row.id,
            title: row.title,
            ...(row.detail === undefined ? {} : { detail: row.detail }),
            availability: declaration.enabled(row.model),
          })),
        ...(config.preferredOf === undefined
          ? {}
          : { preferredOf: config.preferredOf }),
        nothingToChoose: config.nothingToChoose,
      },
      what: declaration.what,
      why: declaration.why,
      ...(config.enabled === undefined ? {} : { enabled: config.enabled }),
      meta: declaration.meta,
    })
  const actions = Array.map(child.actions, liftOne)
  const childOf = (message: Readonly<{ _tag: string }>) =>
    Option.flatMap(
      Array.findFirst(
        child.actions,
        declaration =>
          declaration.tag === message._tag && declaration.isPayloadFree,
      ),
      declaration =>
        Option.map(
          Predicate.hasProperty(message, config.field)
            ? S.decodeUnknownOption(S.toType(config.Id))(message[config.field])
            : Option.none(),
          id => ({ id, message: declaration.make({}) }),
        ),
    )
  return {
    actions: actions as unknown as LiftedActions<
      Actions,
      Field,
      IdSchema,
      Model
    >,
    childOf,
  }
}

// WITHIN

/**
 * How a child Catalog is offered by a parent that holds at most one of
 * the child: where the child's Model is, the sentence while there is none,
 * and when the parent offers the child's Actions at all.
 */
export type WithinConfig<Model, ChildModel> = Readonly<{
  childOf: (model: Model) => Option.Option<ChildModel>
  nothing: string
  enabled?: (model: Model) => Availability
}>

/** One child Action offered by its parent: the same tag and fields. */
export type WithinAction<Child extends AnyAction, Model> =
  Child extends Action<infer Tag, infer Fields, unknown>
    ? Action<Tag, Fields, Model>
    : never

/** Every Action of a child Catalog, offered by its parent. */
export type WithinActions<
  Actions extends Array.NonEmptyReadonlyArray<AnyAction>,
  Model,
> = {
  readonly [K in keyof Actions]: WithinAction<Actions[K], Model>
}

/**
 * A child Program's Catalog offered by a parent that holds at most one of
 * the child, such as the player inside a library. Each Action keeps its
 * tag, fields, words, keys, and choices, and reads the child's Model for
 * its rule, so `SeekToWord:w42` means the same in both. While there is no
 * child, every Action says `nothing`. `childOf` reads a parent Message
 * back as the child's own, for the child's update.
 *
 * @example
 * ```typescript
 * const playerActions = Catalog.within(TranscriptPlayer.catalog, {
 *   childOf: model => loadedPlayerOf(model),
 *   nothing: 'nothing is in the player',
 * })
 * playerActions.actions // [Play, Pause, SeekTo, ...], reading the loaded player
 * playerActions.childOf(SeekTo({ placeMs: 60_000 })) // Some(SeekTo({ placeMs: 60_000 }))
 * ```
 */
const schemaOf = (
  declaration: AnyAction,
): S.TaggedStruct<string, S.Struct.Fields> =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  declaration as unknown as S.TaggedStruct<string, S.Struct.Fields>

export const within = <
  const Actions extends Array.NonEmptyReadonlyArray<AnyAction>,
  Model,
>(
  child: Catalog<Actions>,
  config: WithinConfig<Model, ModelOf<Catalog<Actions>>>,
): Readonly<{
  actions: WithinActions<Actions, Model>
  childOf: (
    message: Readonly<{ _tag: string }>,
  ) => Option.Option<MessageOf<Catalog<Actions>>>
}> => {
  const parentEnabled = config.enabled ?? alwaysEnabled
  const withChild =
    <A>(
      onChild: (childModel: ModelOf<Catalog<Actions>>) => A,
      onNone: () => A,
    ) =>
    (model: Model): A =>
      Option.match(config.childOf(model), { onNone, onSome: onChild })
  const offerOne = (declaration: AnyAction): AnyAction =>
    callableWith(schemaOf(declaration), {
      tag: declaration.tag,
      what: declaration.what,
      why: declaration.why,
      meta: declaration.meta,
      isPayloadFree: declaration.isPayloadFree,
      enabled: (model: Model) => {
        const availability = parentEnabled(model)
        return isEnabled(availability)
          ? withChild(declaration.enabled, () =>
              Disabled({ because: config.nothing }),
            )(model)
          : availability
      },
      maybeChoose: Option.map(declaration.maybeChoose, choose => ({
        ...choose,
        nothingToChoose: config.nothing,
        choicesOf: withChild(choose.choicesOf, () => []),
        preferredOf: withChild(choose.preferredOf, () => Option.none()),
        acceptsOf: (model: Model, token: string) =>
          withChild(
            childModel => choose.acceptsOf(childModel, token),
            () => Option.none(),
          )(model),
      })),
    })
  const actions = Array.map(child.actions, offerOne)
  const childOf = (
    message: Readonly<{ _tag: string }>,
  ): Option.Option<MessageOf<Catalog<Actions>>> =>
    Array.some(child.actions, declaration => declaration.tag === message._tag)
      ? /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
        Option.some(message as MessageOf<Catalog<Actions>>)
      : Option.none()
  return {
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    actions: actions as unknown as WithinActions<Actions, Model>,
    childOf,
  }
}
