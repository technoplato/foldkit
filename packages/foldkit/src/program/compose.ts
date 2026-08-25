/**
 * Program.compose — one site to nest Programs; Model / Message / init / update
 * are derived (ADR 0007 Q6: P0 + P1 monorepo catalog).
 *
 * Under the hood each child Message is tagged `{ _tag: key, message }`.
 * Authors do not hand-write Got* unions or fold arms for catalog children.
 */
import { Array, Data, Predicate, Schema as S, type Schema } from 'effect'

import { mapMessages } from '../command/index.js'
import { actionMenu } from './actionMenu.js'
import type {
  MessageOf,
  ModelOf,
  Program,
  ProgramCommand,
  ProgramSchema,
} from './program.js'
import { make } from './program.js'
import { sync } from './sync.js'

// ── Minimal program surface used by compose ─────────────────────────

/**
 * Existential Program surface for compose (avoids Message contravariance
 * when bagging heterogeneous children).
 */
export type AnyProgram = {
  readonly id: string
  readonly version: number
  readonly Model: ProgramSchema<any>
  readonly Message: ProgramSchema<any>
  readonly init: () => readonly [any, ReadonlyArray<ProgramCommand<any, any>>]
  readonly restore?: (
    model: any,
  ) => readonly [any, ReadonlyArray<ProgramCommand<any, any>>]
  readonly update: (
    model: any,
    message: any,
  ) => readonly [any, ReadonlyArray<ProgramCommand<any, any>>]
}

/** Map of child Programs keyed by slot name (const object preferred). */
export type ChildrenMap = {
  readonly [key: string]: AnyProgram
}

/** Parent Model: one field per child key (preserves literal keys). */
export type ComposedModel<Children extends ChildrenMap> = {
  readonly [K in keyof Children]: ModelOf<Children[K]>
}

/** Parent Message: tagged wrapper per child (replaces hand Got*). */
export type ComposedMessage<Children extends ChildrenMap> = {
  [K in keyof Children]: {
    readonly _tag: K & string
    readonly message: MessageOf<Children[K]>
  }
}[keyof Children]

type ChildCommand<Children extends ChildrenMap> = ProgramCommand<
  ComposedMessage<Children> & Readonly<{ _tag: string }>,
  any
>

export type ComposeOptions = Readonly<{
  /** Program id (default: `composed`). */
  id?: string
  /** Program version (default: 1). */
  version?: number
}>

/** Helpers derived next to the composed Program. */
export type ComposedHelpers<Children extends ChildrenMap> = {
  /** Child keys in registration order. */
  readonly keys: ReadonlyArray<keyof Children & string>
  /**
   * Build a parent Message for a child:
   * `composed.message.single(Counter.ClickedIncrement())`
   */
  readonly message: {
    [K in keyof Children]-?: (
      message: MessageOf<Children[K]>,
    ) => Extract<ComposedMessage<Children>, { readonly _tag: K }>
  }
  /** Read one child Model: `composed.get.single(model)`. */
  readonly get: {
    [K in keyof Children]-?: (
      model: ComposedModel<Children>,
    ) => ModelOf<Children[K]>
  }
}

export type ComposedProgram<Children extends ChildrenMap> = Program<
  ComposedModel<Children>,
  ComposedMessage<Children> & Readonly<{ _tag: string }>,
  any,
  never,
  undefined
> &
  ComposedHelpers<Children>

const wrapMessage =
  <K extends string>(key: K) =>
  <M>(message: M): { readonly _tag: K; readonly message: M } => ({
    _tag: key,
    message,
  })

const buildMessageSchema = <Children extends ChildrenMap>(
  children: Children,
  keys: ReadonlyArray<keyof Children & string>,
): ProgramSchema<ComposedMessage<Children> & Readonly<{ _tag: string }>> => {
  const members = keys.map(key =>
    S.Struct({
      _tag: S.Literal(key),
      message: children[key]!.Message as S.Top,
    }),
  )

  if (members.length === 0) {
    throw new Error(
      '[foldkit] Program.compose requires at least one child Program',
    )
  }

  if (members.length === 1) {
    return members[0]! as unknown as ProgramSchema<
      ComposedMessage<Children> & Readonly<{ _tag: string }>
    >
  }

  return S.Union(members as never) as unknown as ProgramSchema<
    ComposedMessage<Children> & Readonly<{ _tag: string }>
  >
}

const buildModelSchema = <Children extends ChildrenMap>(
  children: Children,
  keys: ReadonlyArray<keyof Children & string>,
): ProgramSchema<ComposedModel<Children>> => {
  const fields = Object.fromEntries(
    keys.map(key => [key, children[key]!.Model]),
  )
  return S.Struct(fields as never) as unknown as ProgramSchema<
    ComposedModel<Children>
  >
}

/** Union members of one Message Schema. Structs pass through unchanged. */
const schemaMembers = (schema: unknown): ReadonlyArray<S.Top> => {
  if (Predicate.hasProperty(schema, 'members')) {
    const members = schema.members
    if (Array.isArray(members)) {
      return members as ReadonlyArray<S.Top>
    }
  }
  return [schema as S.Top]
}

/** Union members of every field-owner Message Schema. */
const messageMembersOf = (
  schemas: ReadonlyArray<S.Top> | undefined,
): ReadonlyArray<S.Top> =>
  schemas === undefined ? [] : Array.flatMap(schemas, schemaMembers)

/**
 * Compose child Programs into one parent Program.
 *
 * ```ts
 * const Showcase = Program.compose({
 *   single: CounterProgram,
 *   multi: CountersProgram,
 *   calc: CalculatorProgram,
 * })
 * // Showcase.Model / Message / init / update derived
 * // Showcase.message.single(ClickedIncrement())
 * ```
 */
export const compose = <
  const Children extends { readonly [K in keyof Children]: AnyProgram },
>(
  children: Children,
  options?: ComposeOptions,
): ComposedProgram<Children> => {
  type Kids = Children
  const keys = Object.keys(children) as Array<keyof Kids & string>
  if (keys.length === 0) {
    throw new Error(
      '[foldkit] Program.compose requires at least one child Program',
    )
  }

  const kids = children as Kids
  const Model = buildModelSchema(kids, keys)
  const Message = buildMessageSchema(kids, keys)

  const message = {} as ComposedHelpers<Kids>['message']
  const get = {} as ComposedHelpers<Kids>['get']
  for (const key of keys) {
    ;(message as any)[key] = wrapMessage(key)
    ;(get as any)[key] = (model: ComposedModel<Kids>) => model[key]
  }

  const init = (): readonly [
    ComposedModel<Kids>,
    ReadonlyArray<ChildCommand<Kids>>,
  ] => {
    const model = {} as Record<string, unknown>
    const commands: Array<ChildCommand<Kids>> = []

    for (const key of keys) {
      const child = kids[key]!
      const [childModel, childCommands] = child.init()
      model[key] = childModel
      commands.push(
        ...(mapMessages(childCommands, wrapMessage(key)) as ReadonlyArray<
          ChildCommand<Kids>
        >),
      )
    }

    return [model as ComposedModel<Kids>, commands]
  }

  const restore = (
    model: ComposedModel<Kids>,
  ): readonly [ComposedModel<Kids>, ReadonlyArray<ChildCommand<Kids>>] => {
    const next = { ...model } as Record<string, unknown>
    const commands: Array<ChildCommand<Kids>> = []

    for (const key of keys) {
      const child = kids[key]!
      if (child.restore === undefined) {
        continue
      }
      const [childModel, childCommands] = child.restore(model[key])
      next[key] = childModel
      commands.push(
        ...(mapMessages(childCommands, wrapMessage(key)) as ReadonlyArray<
          ChildCommand<Kids>
        >),
      )
    }

    return [next as ComposedModel<Kids>, commands]
  }

  const update = (
    model: ComposedModel<Kids>,
    parentMessage: ComposedMessage<Kids> & Readonly<{ _tag: string }>,
  ): readonly [ComposedModel<Kids>, ReadonlyArray<ChildCommand<Kids>>] => {
    const key = parentMessage._tag as keyof Kids & string
    const child = kids[key]
    if (child === undefined) {
      return [model, []]
    }

    const childMessage = (
      parentMessage as {
        readonly _tag: string
        readonly message: MessageOf<Kids[typeof key]>
      }
    ).message

    const [nextChild, childCommands] = child.update(model[key], childMessage)
    const nextModel = {
      ...model,
      [key]: nextChild,
    } as ComposedModel<Kids>

    return [
      nextModel,
      mapMessages(childCommands, wrapMessage(key)) as ReadonlyArray<
        ChildCommand<Kids>
      >,
    ]
  }

  const program = make({
    id: options?.id ?? `composed:${keys.join('+')}`,
    version: options?.version ?? 1,
    Model,
    Message,
    init,
    restore,
    update,
  })

  return Object.assign(program, {
    keys,
    message,
    get,
  }) as unknown as ComposedProgram<Children>
}

// ── forEach: identified list of one child Program ───────────────────

/** forEach fields declared a key reserved by the composed Model. */
export class ForEachReservedFieldError extends Data.TaggedError(
  'ForEachReservedFieldError',
)<{
  readonly field: string
  readonly reservedKeys: ReadonlyArray<string>
}> {}

/** forEach fields missing an initial value, so init could not build a complete Model. */
export class ForEachInitialFieldMissingError extends Data.TaggedError(
  'ForEachInitialFieldMissingError',
)<{
  readonly field: string
}> {}

export type ForEachRow<ChildModel> = Readonly<{
  id: string
  child: ChildModel
}>

export type ForEachModel<ChildModel> = Readonly<{
  nextId: number
  rows: ReadonlyArray<ForEachRow<ChildModel>>
}>

export type ForEachMessage<ChildMessage> =
  | Readonly<{ readonly _tag: 'ClickedAddRow' }>
  | Readonly<{ readonly _tag: 'ClickedRemoveRow'; readonly id: string }>
  | Readonly<{
      readonly _tag: 'GotChild'
      readonly id: string
      readonly message: ChildMessage
    }>

/**
 * Sibling Model field Schemas composed beside nextId and rows, flattened
 * like the Ready fields of Program.compose.sync.
 */
export type ForEachFields = Readonly<Record<string, S.Top>>

/** Decoded value types of one {@link ForEachFields} bag. */
export type ForEachFieldValues<Fields extends ForEachFields> = Readonly<{
  [K in keyof Fields]: Schema.Schema.Type<Fields[K]>
}>

/** Composed Model with sibling fields: field values beside nextId / rows. */
export type ForEachWithFieldsModel<
  Fields extends ForEachFields,
  ChildModel,
> = ForEachFieldValues<Fields> & ForEachModel<ChildModel>

/** A field-owner Message arriving beside the row Messages. */
export type ForEachFieldMessage = Readonly<{ readonly _tag: string }>

/**
 * App Message when sibling fields compose beside rows: row Messages plus
 * field-owner Messages unwrapped, mirroring how actionMenu unions product
 * Messages without a wrapper tag.
 */
export type ForEachWithFieldsMessage<ChildMessage> =
  | ForEachMessage<ChildMessage>
  | ForEachFieldMessage

/**
 * Reduces one field-owner Message against the whole composed Model.
 * Returns the whole next Model, never a patch.
 */
export type ForEachFieldsUpdate<
  Child extends AnyProgram,
  Fields extends ForEachFields,
> = (
  model: ForEachWithFieldsModel<Fields, ModelOf<Child>>,
  message: ForEachFieldMessage,
) => readonly [
  ForEachWithFieldsModel<Fields, ModelOf<Child>>,
  ReadonlyArray<
    ProgramCommand<
      ForEachWithFieldsMessage<MessageOf<Child>> & Readonly<{ _tag: string }>,
      any
    >
  >,
]

/** Config for {@link forEach} with or without sibling Model fields. */
export type ForEachWithFieldsConfig<
  Child extends AnyProgram,
  Fields extends ForEachFields,
> = ComposeOptions &
  Readonly<{
    /** The one child Program instanced per row. */
    of: Child
    /** Starting row count (each row gets a fresh child.init). Default 0. */
    initialCount?: number
    /**
     * Sibling Model field Schemas flattened beside nextId and rows. Keys must
     * avoid nextId and rows.
     */
    fields?: Fields
    /** Initial value for every sibling field so init returns a complete Model. */
    initialFields?: Partial<ForEachFieldValues<Fields>>
    /**
     * Field-owner Message Schemas unioned flat beside the row Messages, like
     * actionMenu unions product Messages unwrapped. Replay encodes through
     * the composed Message Schema, so declare every handled Message here.
     */
    messages?: ReadonlyArray<S.Top>
    /**
     * Reduces one field-owner Message. Row tags never reach this handler.
     * Commands return at the parent level unchanged.
     */
    updateFields?: ForEachFieldsUpdate<Child, Fields>
  }>

/** No sibling fields: forEach owns the whole composed Model. */
export type ForEachNoFields = Readonly<Record<never, S.Top>>

export type ForEachOptions = ComposeOptions &
  Readonly<{
    /** Starting row count (each row gets a fresh child.init). Default 0. */
    initialCount?: number
  }>

export type ForEachProgram<Child extends AnyProgram> = Program<
  ForEachModel<ModelOf<Child>>,
  ForEachMessage<MessageOf<Child>> & Readonly<{ _tag: string }>,
  any,
  never,
  undefined
> &
  Readonly<{
    of: Child
    /** Wrap a child Message for a row. */
    childMessage: (
      id: string,
      message: MessageOf<Child>,
    ) => ForEachMessage<MessageOf<Child>>
    addRow: ForEachMessage<MessageOf<Child>>
    removeRow: (id: string) => ForEachMessage<MessageOf<Child>>
  }>

/** A Program produced by {@link forEach} with sibling Model fields. */
export type ForEachWithFieldsProgram<
  Child extends AnyProgram,
  Fields extends ForEachFields,
> = Program<
  ForEachWithFieldsModel<Fields, ModelOf<Child>>,
  ForEachWithFieldsMessage<MessageOf<Child>> & Readonly<{ _tag: string }>,
  any,
  never,
  undefined
> &
  Readonly<{
    of: Child
    /** Wrap a child Message for a row. */
    childMessage: (
      id: string,
      message: MessageOf<Child>,
    ) => ForEachMessage<MessageOf<Child>>
    addRow: ForEachMessage<MessageOf<Child>>
    removeRow: (id: string) => ForEachMessage<MessageOf<Child>>
  }>

/**
 * Compose many instances of one child Program (list / forEach).
 *
 * ```ts
 * const CounterList = Program.compose.forEach({ of: CounterProgram })
 * // model.rows[].child · GotChild({ id, message })
 * ```
 *
 * With `fields`, sibling Model fields owned by the host app compose beside
 * `nextId` and `rows`, and field-owner Messages join the union unwrapped the
 * way actionMenu unions product Messages. Row tags stay reserved:
 *
 * ```ts
 * const Counters = Program.compose.forEach({
 *   of: CounterProgram,
 *   fields: { sortOrder: SortOrder },
 *   initialFields: { sortOrder: SortAscending() },
 *   messages: [SortOrder],
 *   updateFields: (model, message) => [{ ...model, sort: message }, []],
 * })
 * ```
 */
export function forEach<
  Child extends AnyProgram,
  Fields extends ForEachFields = ForEachNoFields,
>(
  config: ForEachWithFieldsConfig<Child, Fields>,
): [keyof Fields] extends [never]
  ? ForEachProgram<Child>
  : ForEachWithFieldsProgram<Child, Fields> {
  const child = config.of
  type ChildModel = ModelOf<Child>
  type ChildMessage = MessageOf<Child>

  const fields = config.fields
  const updateFields = config.updateFields

  for (const fieldKey of Object.keys(fields ?? {})) {
    if (fieldKey === 'nextId' || fieldKey === 'rows') {
      throw new ForEachReservedFieldError({
        field: fieldKey,
        reservedKeys: ['nextId', 'rows'],
      })
    }
    if (
      config.initialFields === undefined ||
      !Predicate.hasProperty(config.initialFields, fieldKey)
    ) {
      throw new ForEachInitialFieldMissingError({ field: fieldKey })
    }
  }

  const Row = S.Struct({
    id: S.String,
    child: child.Model,
  })

  const Model = S.Struct({
    ...(fields ?? {}),
    nextId: S.Number,
    rows: S.Array(Row),
  }) as unknown as ProgramSchema<ForEachModel<ChildModel>>

  const ClickedAddRow = S.Struct({ _tag: S.Literal('ClickedAddRow') })
  const ClickedRemoveRow = S.Struct({
    _tag: S.Literal('ClickedRemoveRow'),
    id: S.String,
  })
  const GotChild = S.Struct({
    _tag: S.Literal('GotChild'),
    id: S.String,
    message: child.Message,
  })

  const Message = S.Union([
    ...messageMembersOf(config.messages),
    ClickedAddRow,
    ClickedRemoveRow,
    GotChild,
  ]) as unknown as ProgramSchema<
    ForEachWithFieldsMessage<ChildMessage> & Readonly<{ _tag: string }>
  >

  const childMessage = (
    id: string,
    message: ChildMessage,
  ): ForEachMessage<ChildMessage> => ({
    _tag: 'GotChild',
    id,
    message,
  })

  const addRow: ForEachMessage<ChildMessage> = { _tag: 'ClickedAddRow' }
  const removeRow = (id: string): ForEachMessage<ChildMessage> => ({
    _tag: 'ClickedRemoveRow',
    id,
  })

  const makeRow = (
    id: string,
  ): readonly [
    ForEachRow<ChildModel>,
    ReadonlyArray<ProgramCommand<ForEachMessage<ChildMessage>, any>>,
  ] => {
    const [childModel, commands] = child.init()
    return [
      { id, child: childModel },
      mapMessages(commands, message =>
        childMessage(id, message as ChildMessage),
      ),
    ]
  }

  const init = (): readonly [
    ForEachModel<ChildModel>,
    ReadonlyArray<ProgramCommand<ForEachMessage<ChildMessage>, any>>,
  ] => {
    const initialCount = config.initialCount ?? 0
    const rows: Array<ForEachRow<ChildModel>> = []
    const commands: Array<ProgramCommand<ForEachMessage<ChildMessage>, any>> =
      []
    for (let i = 0; i < initialCount; i += 1) {
      const id = String(i)
      const [row, rowCommands] = makeRow(id)
      rows.push(row)
      commands.push(...rowCommands)
    }
    return [
      { ...(config.initialFields ?? {}), nextId: initialCount, rows },
      commands,
    ]
  }

  const update = (
    model: ForEachModel<ChildModel>,
    message: ForEachWithFieldsMessage<ChildMessage> &
      Readonly<{ _tag: string }>,
  ): readonly [
    ForEachModel<ChildModel>,
    ReadonlyArray<
      ProgramCommand<
        ForEachWithFieldsMessage<ChildMessage> & Readonly<{ _tag: string }>,
        any
      >
    >,
  ] => {
    if (
      message._tag !== 'ClickedAddRow' &&
      message._tag !== 'ClickedRemoveRow' &&
      message._tag !== 'GotChild'
    ) {
      if (updateFields === undefined) {
        return [model, []]
      }
      return updateFields(
        model as ForEachWithFieldsModel<Fields, ChildModel>,
        message,
      )
    }

    const rowMessage = message as ForEachMessage<ChildMessage> &
      Readonly<{ _tag: string }>
    switch (rowMessage._tag) {
      case 'ClickedAddRow': {
        const id = String(model.nextId)
        const [row, rowCommands] = makeRow(id)
        return [
          {
            ...model,
            nextId: model.nextId + 1,
            rows: [...model.rows, row],
          },
          rowCommands,
        ]
      }
      case 'ClickedRemoveRow': {
        return [
          {
            ...model,
            rows: model.rows.filter(row => row.id !== rowMessage.id),
          },
          [],
        ]
      }
      case 'GotChild': {
        const index = model.rows.findIndex(row => row.id === rowMessage.id)
        if (index < 0) {
          return [model, []]
        }
        const row = model.rows[index]!
        const [nextChild, childCommands] = child.update(
          row.child,
          rowMessage.message,
        )
        const rows = model.rows.slice()
        rows[index] = { id: row.id, child: nextChild }
        return [
          { ...model, rows },
          mapMessages(childCommands, m =>
            childMessage(rowMessage.id, m as ChildMessage),
          ),
        ]
      }
      default:
        return [model, []]
    }
  }

  const program = make({
    id: config.id ?? `forEach:${child.id}`,
    version: config.version ?? 1,
    Model,
    Message,
    init,
    update,
  })

  return Object.assign(program, {
    of: child,
    childMessage,
    addRow,
    removeRow,
  }) as [keyof Fields] extends [never]
    ? ForEachProgram<Child>
    : ForEachWithFieldsProgram<Child, Fields>
}

// Attach forEach as compose.forEach for ergonomic import
compose.forEach = forEach
compose.sync = sync
compose.actionMenu = actionMenu

/** Scope one child Program under a fixed key (sugar over compose of one). */
export const scope = <K extends string, Child extends AnyProgram>(
  key: K,
  child: Child,
  options?: ComposeOptions,
): ComposedProgram<{ [P in K]: Child }> =>
  compose({ [key]: child } as { [P in K]: Child }, options)

export type { ChildrenMap as ComposeChildren }
