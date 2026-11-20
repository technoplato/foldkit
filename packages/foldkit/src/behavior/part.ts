import {
  Array,
  Data,
  Effect,
  Option,
  Predicate,
  Record,
  Schema as S,
} from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { mapMessages } from '../command/index.js'
import type { Machine, Tagged } from '../experimental/machine/machine.js'
import {
  type ProgramInteraction,
  fromCatalog,
} from '../interaction/interaction.js'
import { liftEffects } from '../program/liftEffects.js'
import type {
  MessageOf,
  ModelOf,
  Program,
  ProgramCommand,
  ProgramSchema,
  ProgramSynchronization,
} from '../program/program.js'
import { make } from '../program/program.js'
import type { UiNode } from '../renderers/types.js'
import type { ActionContext } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import { GestureKind } from './gesture.js'
import * as LongPress from './longPress.js'
import { type Pace, type Sync, Synced, defaultPace, isSynced } from './pace.js'
import {
  type GesturePress,
  Role,
  type SlotBinding,
  type SlotProps,
  bound,
  withHold,
} from './slot.js'

// NOTE: a part is a whole component, declared once: its state as a chart,
// the Actions a person or an agent does to it, the facts it is told, its
// painted slots, and a pure projection from state to what each slot shows.
// A Program takes parts with one composition call, which adds their state
// to the Model and derives everything else. A painter never sees a part:
// it sees the bindings the projection hands the screen tree.

// DECLARATION

/**
 * One painted element of a part, as data: what it is, how it takes
 * focus, and which Action or fact each gesture on it becomes. `Container`
 * says the highlight is state and focus stays on the part's container.
 *
 * @example
 * ```typescript
 * const Row: SlotDeclaration = {
 *   focus: 'None',
 *   gestures: [
 *     { gesture: 'HeldLong', becomes: 'ShowTitleMenu' },
 *     { gesture: 'PressedSecondary', becomes: 'ShowTitleMenu' },
 *   ],
 * }
 * ```
 */
export const SlotDeclaration = S.Struct({
  role: S.optionalKey(Role),
  focus: S.Literals(['Container', 'None']),
  gestures: S.Array(S.Struct({ gesture: GestureKind, becomes: S.String })),
})
/** One painted element of a part, as data. */
export type SlotDeclaration = typeof SlotDeclaration.Type

/**
 * What configures a part, in three layers: what it is with nothing said,
 * named presets over that, and what one call says over both.
 */
export type Configuration<Settings> = Readonly<{
  base: Settings
  presets: Readonly<Record<string, Partial<Settings>>>
}>

/** The settings every part has: how quickly its input syncs. */
export type PartSettings = Readonly<{ pace: Pace }>

/**
 * A whole component, declared once.
 *
 * - `name` is how its state is keyed in the Model unless a Program says
 *   another key: `TitleMenu`.
 * - `State`, `Message` and `chart` are its state, everything it is told,
 *   and the Machine that says what each Message does in each state.
 *   `Props` is the chart's read-only context, such as a menu's rows.
 * - `actions` are the Catalog Actions a person or an agent does to it on
 *   purpose. They join the Program's Catalog.
 * - `sync` says, for every Message, how it syncs. Synced is the default
 *   and a Message that stays on the device says why.
 * - `category` says who a synced Message reaches: `Domain` every device,
 *   `Navigation` the devices the session mirrors.
 * - `slots` are its painted elements and `project` what each shows.
 * - `atRest` is what a restart opens it on, such as a closed menu.
 */
export type Part<
  State extends Tagged,
  Message extends Tagged,
  Props = void,
> = Readonly<{
  name: string
  State: S.Codec<State, unknown, never, never>
  Message: S.Codec<Message, unknown, never, never> &
    Readonly<{ members: ReadonlyArray<S.Top> }>
  chart: Machine<State, Message, never, any>
  actions: ReadonlyArray<Catalog.AnyAction>
  sync: Readonly<Record<Message['_tag'], Sync>>
  category: MessageCategory
  slots: Readonly<Record<string, SlotDeclaration>>
  atRest: (state: State) => State
  project: (
    state: State,
    props: Props,
    slot: string,
    maybeChoice: Option.Option<string>,
  ) => SlotProps
  configuration: Configuration<PartSettings>
}>

/** Any part, whatever its state, Messages and props. */
export type AnyPart = Part<any, any, any>

/** A part's declaration was wrong in a way `define` names. */
export class PartDeclarationError extends Data.TaggedError(
  'PartDeclarationError',
)<{
  readonly part: string
  readonly message: string
}> {}

const actionTagsOf = (part: AnyPart): ReadonlyArray<string> =>
  Array.map(part.actions, action => action.tag)

/**
 * What is wrong with a part's declaration, one sentence each. A part
 * with no problems answers none.
 *
 * - A gesture that becomes a name no Action of the part has.
 * - An Action with no `what` or no `why`.
 * - A Message of the chart with no word on how it syncs.
 * - A Message that stays on the device beside one that syncs, on one
 *   state: when the log refolds, what the device one did is lost, and the
 *   cure is two states.
 *
 * @example
 * ```typescript
 * problemsOf(TitleMenu) // []
 * ```
 */
export const problemsOf = (part: AnyPart): ReadonlyArray<string> => {
  const actionTags = actionTagsOf(part)
  const messageTags: ReadonlyArray<string> = Array.map(
    part.chart.edges,
    edge => edge.messageTag,
  )
  const syncs = Object.values<Sync>(part.sync)
  return [
    ...Array.flatMap(Record.toEntries(part.slots), ([slot, declaration]) =>
      Array.flatMap(declaration.gestures, each =>
        Array.contains(actionTags, each.becomes)
          ? []
          : [
              `${part.name}: ${each.gesture} on ${slot} becomes ${each.becomes}, which is not one of its Actions`,
            ],
      ),
    ),
    ...Array.flatMap(part.actions, action =>
      action.what === '' || action.why === ''
        ? [`${part.name}: ${action.tag} does not say what and why`]
        : [],
    ),
    ...Array.flatMap(Array.dedupe(messageTags), tag =>
      Object.hasOwn(part.sync, tag)
        ? []
        : [`${part.name}: ${tag} does not say how it syncs`],
    ),
    ...(Array.some(syncs, isSynced) && !Array.every(syncs, isSynced)
      ? [
          `${part.name}: one state takes a Message that stays on the device and one that syncs; give each its own state`,
        ]
      : []),
  ]
}

/**
 * Declares a part, refusing a wrong declaration by name.
 *
 * @example
 * ```typescript
 * const TitleMenu = Part.define({
 *   name: 'TitleMenu',
 *   State, Message, chart,
 *   actions: [ShowTitleMenu, CloseTitleMenu],
 *   sync: { ShowTitleMenu: Synced(), CloseTitleMenu: Synced() },
 *   slots: { Row: { focus: 'None', gestures: [{ gesture: 'HeldLong', becomes: 'ShowTitleMenu' }] } },
 *   atRest: () => Closed(),
 *   project: (state, _props, _slot, maybeChoice) => ({ isExpanded: isOpenOn(state, maybeChoice) }),
 * })
 * ```
 */
export const define = <
  State extends Tagged,
  Message extends Tagged,
  Props = void,
>(
  declaration: Omit<Part<State, Message, Props>, 'category' | 'configuration'> &
    Readonly<{
      category?: MessageCategory
      configuration?: Configuration<PartSettings>
    }>,
): Part<State, Message, Props> => {
  const part: Part<State, Message, Props> = {
    ...declaration,
    category: declaration.category ?? 'Domain',
    configuration: declaration.configuration ?? {
      base: { pace: defaultPace },
      presets: {},
    },
  }
  return Option.match(Array.head(problemsOf(part)), {
    onNone: () => part,
    onSome: problem => {
      throw new PartDeclarationError({ part: part.name, message: problem })
    },
  })
}

/**
 * A part's settings for one use: its base, then a named preset over it,
 * then what the call says over both. An unknown preset is refused by name.
 *
 * @example
 * ```typescript
 * configure(Slider)('Coarse', { pace: { ...defaultPace, dragGrain: Step({ size: 10, origin: 0 }) } })
 * configure(Slider)('Unheard') // throws: Slider has no preset Unheard
 * ```
 */
export const configure =
  (part: AnyPart) =>
  (preset?: string, call: Partial<PartSettings> = {}): PartSettings => {
    const { base, presets } = part.configuration
    if (preset === undefined) {
      return { ...base, ...call }
    } else if (Object.hasOwn(presets, preset)) {
      return { ...base, ...presets[preset], ...call }
    } else {
      throw new PartDeclarationError({
        part: part.name,
        message: `${part.name} has no preset ${preset}`,
      })
    }
  }

// PROJECTION

/**
 * The press a gesture on a slot sends: the Action's tag, with the choice
 * after a colon when the slot is one of many, as every press on the
 * screen tree is written.
 *
 * @example
 * ```typescript
 * pressOf('ShowTitleMenu', Option.some('salt-road')) // 'ShowTitleMenu:salt-road'
 * pressOf('CloseTitleMenu', Option.none()) // 'CloseTitleMenu'
 * ```
 */
export const pressOf = (
  tag: string,
  maybeChoice: Option.Option<string>,
): string =>
  Option.match(maybeChoice, {
    onNone: () => tag,
    onSome: choice => `${tag}:${choice}`,
  })

/**
 * The binding a painter reads for one slot of a part: the press each of
 * the slot's gestures sends, what a platform with no hold must tell, and
 * what the projection says of the slot.
 *
 * @example
 * ```typescript
 * bindingOf(TitleMenu, 'Row', { isExpanded: false }, Option.some('salt-road'))
 * // gestures: [{ gesture: 'HeldLong', press: 'ShowTitleMenu:salt-road' }, ...], isExpanded: false
 * ```
 */
export const bindingOf = (
  part: AnyPart,
  slot: string,
  props: SlotProps,
  maybeChoice: Option.Option<string> = Option.none(),
): SlotBinding => {
  const declaration = part.slots[slot]
  const gestures: ReadonlyArray<GesturePress> =
    declaration === undefined
      ? []
      : Array.map(declaration.gestures, each => ({
          gesture: each.gesture,
          press: pressOf(each.becomes, maybeChoice),
        }))
  return bound(gestures, {
    ...props,
    ...(declaration?.role === undefined ? {} : { role: declaration.role }),
  })
}

/**
 * A part as a screen reads it: its state, and the binding of any of its
 * slots, `view.slot('Row', 'salt-road')`.
 */
export type View<State> = Readonly<{
  state: State
  slot: (slot: string, choice?: string) => SlotBinding
}>

type Viewed = Readonly<{
  state: unknown
  props: unknown
  view: View<any>
  bindings: Map<string, SlotBinding>
}>

const viewed = new WeakMap<AnyPart, Viewed>()

const isSameProps = (before: unknown, after: unknown): boolean => {
  if (Object.is(before, after)) {
    return true
  } else if (Predicate.isObject(before) && Predicate.isObject(after)) {
    const keys = Object.keys(after)
    return (
      keys.length === Object.keys(before).length &&
      Array.every(keys, key =>
        Object.is(Reflect.get(before, key), Reflect.get(after, key)),
      )
    )
  } else {
    return false
  }
}

const isSameBinding = (before: SlotBinding, after: SlotBinding): boolean =>
  JSON.stringify(before) === JSON.stringify(after)

/**
 * A part as a screen reads it, from its state and its props.
 *
 * The law of the projection: unchanged state in, identical projection
 * out. For the same state object, and props whose fields are each the
 * same by `Object.is`, the answer is the same object and so is every
 * binding it hands out, so a painter that skips by reference skips. When
 * the state does change, a slot whose binding did not change keeps the
 * object it had: the title menu opens on Salt Road, and the binding of A
 * Tin Comet's row is the object it was.
 *
 * @example
 * ```typescript
 * const menu = Part.view(TitleMenu, model.parts.TitleMenu, { titles: model.titles })
 * menu.slot('Row', 'salt-road') // the row's binding
 * Part.view(TitleMenu, model.parts.TitleMenu, { titles: model.titles }) === menu // true
 * ```
 */
export const view = <State extends Tagged, Message extends Tagged, Props>(
  part: Part<State, Message, Props>,
  state: State,
  props: Props,
): View<State> => {
  const maybeBefore = Option.fromNullishOr(viewed.get(part))
  if (
    Option.isSome(maybeBefore) &&
    maybeBefore.value.state === state &&
    isSameProps(maybeBefore.value.props, props)
  ) {
    return maybeBefore.value.view
  } else {
    const bindings = new Map<string, SlotBinding>()
    const slot = (name: string, choice?: string): SlotBinding => {
      const key = `${name}\u0000${choice ?? ''}`
      const maybeKnown = Option.fromNullishOr(bindings.get(key))
      if (Option.isSome(maybeKnown)) {
        return maybeKnown.value
      } else {
        const maybeChoice = Option.fromNullishOr(choice)
        const fresh = bindingOf(
          part,
          name,
          part.project(state, props, name, maybeChoice),
          maybeChoice,
        )
        const kept = Option.match(
          Option.flatMap(maybeBefore, before =>
            Option.fromNullishOr(before.bindings.get(key)),
          ),
          {
            onNone: () => fresh,
            onSome: before => (isSameBinding(before, fresh) ? before : fresh),
          },
        )
        bindings.set(key, kept)
        return kept
      }
    }
    const next: View<State> = { state, slot }
    viewed.set(part, { state, props, view: next, bindings })
    return next
  }
}

// SYNCHRONIZATION

/**
 * What a composition tells `synchronizationOf` about itself: which
 * Messages are its own and how each syncs, how to carry its
 * device-only state across a refold, and what it rests at.
 */
export type OwnSynchronization<AppModel, AppMessage> = Readonly<{
  isOwn: (message: AppMessage) => boolean
  syncOf: (message: AppMessage) => Sync
  categoryOf: (message: AppMessage) => MessageCategory
  maybeKeep: Option.Option<(current: AppModel, refolded: AppModel) => AppModel>
  atRest: (model: AppModel) => AppModel
}>

/**
 * The answers a Program gives sync about a composition's own Messages
 * and state, derived from what each Message declares, with the child's
 * answers lifted beside them. No Program lists these by hand.
 *
 * - `messageCategory`: the category an own Message declares; the child's
 *   answer for the child's.
 * - `isLocalOnly`: true for an own Message declared `Device`; the child's
 *   answer for the child's. Left out when neither has one to give.
 * - `keepOnRefold`: the child's, lifted, then the composition's own
 *   device-only state carried from the current Model, since no log can
 *   fold it. Left out when neither has anything to keep.
 * - `projectLocal`: the child's, lifted, then the composition at rest, so
 *   a restart never opens on a half-made press or an open menu.
 * - `paceOf`: how each Message syncs, for the writer of the log: an own
 *   Message as it declares, the child's as the child says, else synced.
 *
 * @example
 * ```typescript
 * synchronizationOf({
 *   maybeChild: Option.fromNullishOr(child.synchronization),
 *   childOf, withChild,
 *   own: { isOwn: isMessage, syncOf: () => Synced(), categoryOf: () => 'Navigation', maybeKeep: Option.none(), atRest: dismissed },
 * })
 * // { messageCategory, projectLocal, paceOf } and, when the child has them, isLocalOnly and keepOnRefold
 * ```
 */
export const synchronizationOf = <
  AppModel,
  AppMessage,
  ChildModel,
  ChildMessage,
>(config: {
  maybeChild: Option.Option<ProgramSynchronization<ChildModel, ChildMessage>>
  childOf: (model: AppModel) => ChildModel
  withChild: (model: AppModel, childModel: ChildModel) => AppModel
  own: OwnSynchronization<AppModel, AppMessage>
  hasDeviceMessages: boolean
}): Pick<
  ProgramSynchronization<AppModel, AppMessage>,
  'messageCategory' | 'isLocalOnly' | 'keepOnRefold' | 'projectLocal' | 'paceOf'
> => {
  const { maybeChild, childOf, withChild, own } = config
  const child = Option.getOrUndefined(maybeChild)
  const childIsLocalOnly = child?.isLocalOnly
  const childKeepOnRefold = child?.keepOnRefold
  const childProjectLocal = child?.projectLocal
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  const asChild = (message: AppMessage) => message as unknown as ChildMessage
  const isLocalOnly =
    childIsLocalOnly === undefined && !config.hasDeviceMessages
      ? {}
      : {
          isLocalOnly: (message: AppMessage): boolean =>
            own.isOwn(message)
              ? !isSynced(own.syncOf(message))
              : (childIsLocalOnly?.(asChild(message)) ?? false),
        }
  const liftedKeep =
    childKeepOnRefold === undefined
      ? Option.none<(current: AppModel, refolded: AppModel) => AppModel>()
      : Option.some(
          (current: AppModel, refolded: AppModel): AppModel =>
            withChild(
              refolded,
              childKeepOnRefold(childOf(current), childOf(refolded)),
            ),
        )
  const keepOnRefold =
    Option.isNone(liftedKeep) && Option.isNone(own.maybeKeep)
      ? {}
      : {
          keepOnRefold: (current: AppModel, refolded: AppModel): AppModel => {
            const lifted = Option.match(liftedKeep, {
              onNone: () => refolded,
              onSome: keep => keep(current, refolded),
            })
            return Option.match(own.maybeKeep, {
              onNone: () => lifted,
              onSome: keep => keep(current, lifted),
            })
          },
        }
  return {
    messageCategory: message =>
      own.isOwn(message)
        ? own.categoryOf(message)
        : (child?.messageCategory(asChild(message)) ?? 'Domain'),
    ...isLocalOnly,
    ...keepOnRefold,
    projectLocal: model =>
      own.atRest(
        childProjectLocal === undefined
          ? model
          : withChild(model, childProjectLocal(childOf(model))),
      ),
    paceOf: message =>
      own.isOwn(message)
        ? own.syncOf(message)
        : (child?.paceOf?.(asChild(message)) ?? Synced()),
  }
}

// COMPOSE

/**
 * A part as one Program holds it: the part, the key its state sits under
 * in the Model, and how its props are read from the Model.
 *
 * @example
 * ```typescript
 * Part.given(TitleMenu, model => ({ titles: model.titles }))
 * Part.given(TitleMenu, model => ({ titles: model.wishes }), 'wishMenu')
 * ```
 */
export type Given = Readonly<{
  part: AnyPart
  key: string
  propsOf: (model: any) => unknown
}>

/**
 * Hands a part to a Program, with how its props are read from the Model.
 * A second use of the same part takes its own `key`, so a Program can
 * hold two menus.
 *
 * @example
 * ```typescript
 * Part.compose({ of: Shelf, parts: [Part.given(TitleMenu, model => ({ titles: model.titles }))] })
 * ```
 */
export const given = <State extends Tagged, Message extends Tagged, Props>(
  part: Part<State, Message, Props>,
  propsOf: (model: any) => Props,
  key: string = part.name,
): Given => ({ part, key, propsOf })

/** A child Program `compose` can wrap: its Model is a struct. */
export type PartChild = Program<any, any, any, any, any>

/** The state of every part a Program holds, with the hold's. */
export type PartsModel = Readonly<{ hold: LongPress.State }> &
  Readonly<Record<string, any>>

/** The composed Model: the child's fields, flat, plus `parts`. */
export type PartModel<Child extends PartChild> = ModelOf<Child> &
  Readonly<{ parts: PartsModel }>

/** The composed Message: the child's, the hold's, and each part's. */
export type PartMessage<Child extends PartChild> =
  | MessageOf<Child>
  | LongPress.Message
  | Tagged

/** The parts of a Program as its screen reads them, by key. */
export type Views = Readonly<Record<string, View<any>>>

/** A Program produced by {@link compose}. */
export type PartProgram<Child extends PartChild> = Program<
  PartModel<Child>,
  PartMessage<Child> & Readonly<{ _tag: string }>,
  any,
  never,
  undefined
> &
  Readonly<{ of: Child; partKeys: ReadonlyArray<string> }> &
  Catalog.CatalogCarrierOf<Child>

/** A child could not be composed because its Model is not a struct. */
export class PartChildError extends Data.TaggedError('PartChildError')<{
  readonly programId: string
  readonly message: string
}> {}

const holdKey = 'hold'

const isDeviceOnly = (sync: Readonly<Record<string, Sync>>): boolean =>
  !Array.some(Object.values<Sync>(sync), isSynced)

const stateField = (
  State: S.Codec<any, unknown, never, never>,
  initial: unknown,
  isOmitted: boolean,
) =>
  State.pipe(
    S.withDecodingDefaultKey(
      Effect.sync(() => S.encodeSync(State)(initial)),
      {
        encodingStrategy: isOmitted ? 'omit' : 'passthrough',
      },
    ),
  )

/**
 * Wraps a Program with its parts. This is the one call that makes a part
 * work: no screen, and no Program, writes anything else for it.
 *
 * - The Model gains `parts`: the state of each part under its key, and
 *   the hold's. A state none of whose Messages sync is left out of the
 *   encoded Model, so a kept Model, a shared snapshot and a golden fold
 *   are as they were.
 * - The Message union gains each part's Messages and the hold's.
 * - `update` folds each part's Message through its chart, with its props
 *   read from the Model as the chart's context.
 * - The Catalog gains each part's Actions, so a key, a menu row and an
 *   agent's tool are derived for them like any other.
 * - `press` reads a hold's token as the hold's Message.
 * - The answers to sync come from what each Message declares.
 * - `screen` is the child's, built again only when a field it reads
 *   changed; or `screen(model, views)` when a screen reads its parts.
 *   While a hold is completed, the tree says so on what a hold can ask
 *   of.
 *
 * @example
 * ```typescript
 * const App = Part.compose({
 *   of: Shelf,
 *   parts: [Part.given(TitleMenu, model => ({ titles: model.titles }))],
 *   screen: (model, { TitleMenu: menu }) => shelfScreen(model, menu),
 * })
 * ```
 */
export const compose = <Child extends PartChild>(config: {
  of: Child
  parts?: ReadonlyArray<Given>
  screen?: (model: PartModel<Child>, views: Views) => UiNode
  id?: string
}): PartProgram<Child> => {
  const child = config.of
  const givens = config.parts ?? []
  type ChildModel = ModelOf<Child>
  type ChildMessage = MessageOf<Child>
  type AppModel = PartModel<Child>
  type AppMessage = PartMessage<Child> & Readonly<{ _tag: string }>
  type AppCommand = ProgramCommand<AppMessage, any>

  if (!Predicate.hasProperty(child.Model, 'fields')) {
    throw new PartChildError({
      programId: child.id,
      message: `${child.id}: its Model is not a struct`,
    })
  }
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  const childFields = child.Model.fields as S.Struct.Fields
  if (Object.hasOwn(childFields, 'parts')) {
    throw new PartChildError({
      programId: child.id,
      message: `${child.id}: its Model already has a field named parts`,
    })
  }
  const keys = Array.map(givens, each => each.key)
  const maybeSharedKey = Array.findFirst(
    keys,
    key =>
      key === holdKey || Array.filter(keys, other => other === key).length > 1,
  )
  if (Option.isSome(maybeSharedKey)) {
    throw new PartChildError({
      programId: child.id,
      message: `${child.id}: two parts share the key ${maybeSharedKey.value}; give one its own key`,
    })
  }

  const isEveryPartDeviceOnly = Array.every(givens, each =>
    isDeviceOnly(each.part.sync),
  )
  const PartsSchema = S.Struct({
    [holdKey]: stateField(LongPress.State, LongPress.initial, true),
    ...Record.fromEntries(
      Array.map(givens, each => [
        each.key,
        stateField(
          each.part.State,
          each.part.chart.initial,
          isDeviceOnly(each.part.sync),
        ),
      ]),
    ),
  })
  const initialParts = (): PartsModel => ({
    [holdKey]: LongPress.initial,
    ...Record.fromEntries(
      Array.map(givens, each => [each.key, each.part.chart.initial]),
    ),
  })
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  const Model = S.Struct({
    ...childFields,
    parts: PartsSchema.pipe(
      S.withDecodingDefaultKey(
        Effect.sync(() => ({})),
        { encodingStrategy: isEveryPartDeviceOnly ? 'omit' : 'passthrough' },
      ),
    ),
  }) as unknown as ProgramSchema<AppModel>

  const childMembers: ReadonlyArray<S.Top> = Predicate.hasProperty(
    child.Message,
    'members',
  )
    ? /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
      (child.Message.members as ReadonlyArray<S.Top>)
    : [child.Message]
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  const Message = S.Union([
    ...childMembers,
    ...LongPress.Message.members,
    ...Array.flatMap(givens, each => each.part.Message.members),
  ]) as unknown as ProgramSchema<AppMessage>

  const childOf = (model: AppModel): ChildModel => {
    const { parts: _parts, ...childModel } = model
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    return childModel as ChildModel
  }
  const withChild = (model: AppModel, childModel: ChildModel): AppModel =>
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    ({ ...childModel, parts: model.parts }) as AppModel
  const withPart = (model: AppModel, key: string, state: unknown): AppModel =>
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    ({ ...model, parts: { ...model.parts, [key]: state } }) as AppModel

  const givenOf = (message: AppMessage): Option.Option<Given> =>
    Array.findFirst(givens, each => S.is(each.part.Message)(message))

  const init = (): readonly [AppModel, ReadonlyArray<AppCommand>] => {
    const [childModel, commands] = child.init()
    return [
      /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
      { ...childModel, parts: initialParts() } as AppModel,
      /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
      commands as ReadonlyArray<AppCommand>,
    ]
  }

  const restore = (
    model: AppModel,
  ): readonly [AppModel, ReadonlyArray<AppCommand>] => {
    if (child.restore === undefined) {
      return [model, []]
    } else {
      const [childModel, commands] = child.restore(childOf(model))
      return [
        withChild(model, childModel),
        /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
        commands as ReadonlyArray<AppCommand>,
      ]
    }
  }

  const update = (
    model: AppModel,
    message: AppMessage,
  ): readonly [AppModel, ReadonlyArray<AppCommand>] => {
    if (LongPress.isMessage(message)) {
      const [hold, commands] = LongPress.chart.transition(
        model.parts.hold,
        message,
      )
      return [withPart(model, holdKey, hold), commands]
    } else {
      return Option.match(givenOf(message), {
        onSome: each => {
          const [state, commands] = each.part.chart.transition(
            model.parts[each.key],
            message,
            each.propsOf(model),
          )
          return [
            withPart(model, each.key, state),
            /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
            commands as ReadonlyArray<AppCommand>,
          ]
        },
        onNone: () => {
          const [childModel, commands] = child.update(
            childOf(model),
            /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
            message as ChildMessage,
          )
          return [
            withChild(model, childModel),
            /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
            mapMessages(commands, each => each as AppMessage),
          ]
        },
      })
    }
  }

  const partActions = Array.flatMap(givens, each => each.part.actions)
  const maybePartCatalog = Array.match(partActions, {
    onEmpty: () => Option.none(),
    onNonEmpty: actions => Option.some(Catalog.make(actions)),
  })
  const maybePartInteraction = Option.map(maybePartCatalog, fromCatalog)
  const catalog = Array.match(partActions, {
    onEmpty: () => child.catalog,
    onNonEmpty: actions =>
      child.catalog === undefined
        ? Catalog.make(actions)
        : Catalog.make([...child.catalog.actions, ...actions]),
  })

  const childInteraction = child.interaction
  const pressPart = (model: AppModel, tag: string): ReadonlyArray<AppMessage> =>
    Option.match(maybePartInteraction, {
      onNone: () => [],
      /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
      onSome: own => own.press(model, tag) as ReadonlyArray<AppMessage>,
    })
  const press = (model: AppModel, tag: string): ReadonlyArray<AppMessage> =>
    Option.match(LongPress.messageOfToken(tag), {
      onSome: told => [told],
      onNone: () =>
        Array.match(pressPart(model, tag), {
          onNonEmpty: messages => messages,
          onEmpty: () =>
            childInteraction === undefined
              ? []
              : /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
                (childInteraction.press(
                  childOf(model),
                  tag,
                ) as ReadonlyArray<AppMessage>),
        }),
    })
  const ownEntries = (model: AppModel) =>
    Option.match(maybePartInteraction, {
      onNone: () => [],
      onSome: own => own.entries(model),
    })
  const interaction: ProgramInteraction<AppModel, AppMessage> | undefined =
    childInteraction === undefined
      ? Option.getOrUndefined(
          Option.map(maybePartInteraction, own => ({
            ...own,
            /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
            pressKey: own.pressKey as ProgramInteraction<
              AppModel,
              AppMessage
            >['pressKey'],
            press,
            openMenu: () => [],
            dismissMenu: () => [],
            typeInMenu: () => [],
            chooseFromMenu: () => [],
          })),
        )
      : {
          menuTitle: childInteraction.menuTitle,
          menuKeys: childInteraction.menuKeys,
          status: model => childInteraction.status(childOf(model)),
          entries: model => [
            ...childInteraction.entries(childOf(model)),
            ...ownEntries(model),
          ],
          press,
          pressKey: (model, input) =>
            Array.match(
              /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
              childInteraction.pressKey(
                childOf(model),
                input,
              ) as ReadonlyArray<AppMessage>,
              {
                onNonEmpty: messages => messages,
                onEmpty: () =>
                  Option.match(maybePartInteraction, {
                    onNone: () => [],
                    onSome: own =>
                      /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
                      own.pressKey(model, input) as ReadonlyArray<AppMessage>,
                  }),
              },
            ),
          menu: model => childInteraction.menu(childOf(model)),
          /* eslint-disable @typescript-eslint/consistent-type-assertions */
          openMenu: model =>
            childInteraction.openMenu(
              childOf(model),
            ) as ReadonlyArray<AppMessage>,
          dismissMenu: model =>
            childInteraction.dismissMenu(
              childOf(model),
            ) as ReadonlyArray<AppMessage>,
          typeInMenu: (model, query) =>
            childInteraction.typeInMenu(
              childOf(model),
              query,
            ) as ReadonlyArray<AppMessage>,
          chooseFromMenu: (model, tag) =>
            childInteraction.chooseFromMenu(
              childOf(model),
              tag,
            ) as ReadonlyArray<AppMessage>,
          /* eslint-enable @typescript-eslint/consistent-type-assertions */
        }

  const syncIn = (
    sync: Readonly<Record<string, Sync>>,
    message: Readonly<{ _tag: string }>,
  ): Sync => Option.getOrElse(Record.get(sync, message._tag), () => Synced())
  const syncOfOwn = (message: AppMessage): Sync =>
    LongPress.isMessage(message)
      ? syncIn(LongPress.sync, message)
      : Option.match(givenOf(message), {
          onNone: () => Synced(),
          onSome: each => syncIn(each.part.sync, message),
        })
  const deviceKeys: ReadonlyArray<string> = [
    holdKey,
    ...Array.flatMap(givens, each =>
      isDeviceOnly(each.part.sync) ? [each.key] : [],
    ),
  ]
  const derived = synchronizationOf<
    AppModel,
    AppMessage,
    ChildModel,
    ChildMessage
  >({
    maybeChild: Option.fromNullishOr(child.synchronization),
    childOf,
    withChild,
    hasDeviceMessages: true,
    own: {
      isOwn: message =>
        LongPress.isMessage(message) || Option.isSome(givenOf(message)),
      syncOf: syncOfOwn,
      categoryOf: message =>
        Option.match(givenOf(message), {
          onNone: () => 'Navigation',
          onSome: each => each.part.category,
        }),
      maybeKeep: Option.some((current, refolded) => ({
        ...refolded,
        parts: {
          ...refolded.parts,
          ...Record.fromEntries(
            Array.map(deviceKeys, key => [key, current.parts[key]]),
          ),
        },
      })),
      atRest: model => ({
        ...model,
        parts: {
          ...model.parts,
          [holdKey]: LongPress.atRest(model.parts.hold),
          ...Record.fromEntries(
            Array.map(givens, each => [
              each.key,
              each.part.atRest(model.parts[each.key]),
            ]),
          ),
        },
      }),
    },
  })
  const childSynchronization = child.synchronization
  const childSessionPolicyOf = childSynchronization?.sessionPolicyOf

  const viewsOf = (model: AppModel): Views =>
    Record.fromEntries(
      Array.map(givens, each => [
        each.key,
        view(each.part, model.parts[each.key], each.propsOf(model)),
      ]),
    )
  const childScreen = child.screen
  const built: {
    maybeLast: Option.Option<readonly [unknown, unknown, UiNode]>
  } = { maybeLast: Option.none() }
  const childTree = (
    model: AppModel,
    context: ActionContext | undefined,
    build: (childModel: ChildModel) => UiNode,
  ): UiNode => {
    const childModel = childOf(model)
    const maybeKept = Option.filter(
      built.maybeLast,
      ([lastModel, lastContext]) =>
        isSameProps(lastModel, childModel) && Object.is(lastContext, context),
    )
    if (Option.isSome(maybeKept)) {
      return maybeKept.value[2]
    } else {
      const tree = build(childModel)
      built.maybeLast = Option.some([childModel, context, tree])
      return tree
    }
  }
  const screenOf = (
    model: AppModel,
    context?: ActionContext,
  ): UiNode | undefined => {
    if (config.screen !== undefined) {
      return config.screen(model, viewsOf(model))
    } else if (childScreen !== undefined) {
      return childTree(model, context, childModel =>
        childScreen(childModel, context),
      )
    } else {
      return undefined
    }
  }
  const hasScreen = config.screen !== undefined || childScreen !== undefined

  const program = make({
    id: config.id ?? child.id,
    version: child.version,
    Model,
    Message,
    init,
    restore,
    update,
    ...(interaction === undefined ? {} : { interaction }),
    ...(child.navigation === undefined ? {} : { navigation: child.navigation }),
    ...liftEffects(child, (model: AppModel) => Option.some(childOf(model))),
    synchronization: {
      projectDomain: model =>
        childSynchronization === undefined
          ? childOf(model)
          : childSynchronization.projectDomain(childOf(model)),
      ...(childSessionPolicyOf === undefined
        ? {}
        : {
            sessionPolicyOf: (model: AppModel) =>
              childSessionPolicyOf(childOf(model)),
          }),
      ...(childSynchronization?.keepsOwnNavigation === undefined
        ? {}
        : { keepsOwnNavigation: childSynchronization.keepsOwnNavigation }),
      ...derived,
    },
    ...(catalog === undefined ? {} : { catalog }),
    ...(hasScreen
      ? {
          screen: (model: AppModel, context?: ActionContext): UiNode => {
            const tree = screenOf(model, context)
            /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
            const drawn = tree as UiNode
            return Option.match(LongPress.signalOf(model.parts.hold), {
              onNone: () => drawn,
              onSome: signal => withHold(drawn, signal),
            })
          },
        }
      : {}),
  })

  const composed = Object.assign(program, {
    of: child,
    partKeys: Array.map(givens, each => each.key),
  })
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  return composed as unknown as PartProgram<Child>
}
