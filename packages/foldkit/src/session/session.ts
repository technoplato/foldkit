import { Array, Data, Match as M, Predicate, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import type { AnyCatalog, CatalogOf } from '../catalog/catalog.js'
import { mapMessages } from '../command/index.js'
import type {
  MessageOf,
  ModelOf,
  Program,
  ProgramCommand,
  ProgramSchema,
} from '../program/program.js'
import { make } from '../program/program.js'
import {
  Mirror,
  SessionPolicy,
  SharedDomain,
} from '../synchronization/synchronization.js'

// MODEL

/**
 * Whether a session mirrors navigation on every device or keeps it on the
 * device that moved. The domain syncs either way.
 */
export const SessionMode = S.Literals(['Mirror', 'SharedDomain'])
/** Whether a session mirrors navigation or keeps it on each device. */
export type SessionMode = typeof SessionMode.Type

/**
 * The session every Processor folds from the same log rows. `generation`
 * counts mode changes; the later change in log order wins everywhere.
 *
 * @example
 * ```typescript
 * SessionState.make({ mode: 'Mirror', generation: 0 })
 * ```
 */
export const SessionState = S.Struct({
  mode: SessionMode,
  generation: S.Int,
})
/** The session every Processor folds from the same log rows. */
export type SessionState = typeof SessionState.Type

type SessionModel = Readonly<{ session: SessionState }>

// MESSAGE

/** A person chose to show the same screen on every device in the session. */
export const MirrorNavigation = Catalog.action('MirrorNavigation', {
  what: 'Shows the same screen on every device in the session',
  why: 'The person wants every device to go where they go',
  enabled: (model: SessionModel) =>
    model.session.mode === 'Mirror'
      ? Catalog.Disabled({ because: 'navigation is already mirrored' })
      : Catalog.Enabled(),
  meta: { label: 'Mirror navigation', keys: [] },
})

/** A person chose to keep each device on its own screen. */
export const KeepNavigationLocal = Catalog.action('KeepNavigationLocal', {
  what: 'Keeps each device on its own screen while the domain syncs',
  why: 'The person wants to move around without moving everyone else',
  enabled: (model: SessionModel) =>
    model.session.mode === 'SharedDomain'
      ? Catalog.Disabled({ because: 'navigation already stays on each device' })
      : Catalog.Enabled(),
  meta: { label: 'Keep navigation local', keys: [] },
})

/** A session Message: a person changed how the session shares navigation. */
export const Message = S.Union([MirrorNavigation, KeepNavigationLocal])
/** A session Message. */
export type Message = typeof Message.Type

/** True for the session Messages. */
export const isMessage = S.is(Message)

/**
 * The policy one session state means for the runtime's audience rules.
 *
 * @example
 * ```typescript
 * policyOf({ mode: 'SharedDomain', generation: 1 })
 * // SessionPolicy { generation: 1, mode: SharedDomain }
 * ```
 */
export const policyOf = (session: SessionState): SessionPolicy =>
  SessionPolicy.make({
    generation: session.generation,
    mode: M.value(session.mode).pipe(
      M.withReturnType<SessionPolicy['mode']>(),
      M.when('Mirror', () => Mirror.make({})),
      M.when('SharedDomain', () => SharedDomain.make({})),
      M.exhaustive,
    ),
  })

const changedSession = (
  session: SessionState,
  message: Message,
): SessionState =>
  M.value(message).pipe(
    M.withReturnType<SessionState>(),
    M.tagsExhaustive({
      MirrorNavigation: () => ({
        mode: 'Mirror',
        generation: session.generation + 1,
      }),
      KeepNavigationLocal: () => ({
        mode: 'SharedDomain',
        generation: session.generation + 1,
      }),
    }),
  )

// COMPOSE

/** A composed child's Model had the field the combinator reserves. */
export class SessionReservedFieldError extends Data.TaggedError(
  'SessionReservedFieldError',
)<{
  readonly field: string
  readonly programId: string
}> {}

/** Any Program with a Catalog that a session can wrap. */
export type SessionChild = Program<any, any, any, any, any> &
  Readonly<{ catalog: AnyCatalog }>

/** The composed Model: the child's fields, flat, plus `session`. */
export type SessionModelOf<Child extends SessionChild> = ModelOf<Child> &
  SessionModel

/** The composed Message: the child's Messages plus the session Messages. */
export type SessionMessageOf<Child extends SessionChild> =
  | MessageOf<Child>
  | Message

/** The composed Catalog: the child's Actions, then the session Actions. */
export type SessionCatalogOf<Child extends SessionChild> = Catalog.Catalog<
  readonly [
    ...CatalogOf<Child>['actions'],
    typeof MirrorNavigation,
    typeof KeepNavigationLocal,
  ] &
    Array.NonEmptyReadonlyArray<Catalog.AnyAction>
>

/** A Program produced by {@link compose}. */
export type SessionProgram<Child extends SessionChild> = Program<
  SessionModelOf<Child>,
  SessionMessageOf<Child> & Readonly<{ _tag: string }>,
  any,
  never,
  undefined
> &
  Readonly<{ of: Child; catalog: SessionCatalogOf<Child> }>

const structFieldsOf = (schema: unknown): S.Struct.Fields =>
  Predicate.hasProperty(schema, 'fields') && Predicate.isObject(schema.fields)
    ? (schema.fields as S.Struct.Fields)
    : {}

const membersOf = (schema: unknown): ReadonlyArray<S.Top> =>
  Predicate.hasProperty(schema, 'members') && Array.isArray(schema.members)
    ? (schema.members as ReadonlyArray<S.Top>)
    : [schema as S.Top]

/**
 * Wraps a Program with a Catalog in session state every Processor folds
 * from the log. The session's mode decides who applies Navigation
 * Messages: under Mirror every device follows; under SharedDomain each
 * device keeps its own screen while the domain syncs. A mode change is an
 * ordinary logged Action, so every Processor switches at the same log
 * position, and two tabs can never disagree about the mode. Compose it
 * inside `ActionMenu.compose` so the session Actions appear in the menu.
 *
 * @example
 * ```typescript
 * const App = ActionMenu.compose({ of: Session.compose({ of: CounterProgram }) })
 * // App.Model: { count, session: { mode: 'Mirror', generation: 0 }, navigation }
 * // pressing KeepNavigationLocal on one device switches every device
 * ```
 */
export const compose = <Child extends SessionChild>(config: {
  of: Child
  initialMode?: SessionMode
  id?: string
  version?: number
}): SessionProgram<Child> => {
  const child = config.of
  type ChildModel = ModelOf<Child>
  type ChildMessage = MessageOf<Child>
  type AppModel = SessionModelOf<Child>
  type AppMessage = SessionMessageOf<Child> & Readonly<{ _tag: string }>
  type AppCommand = ProgramCommand<AppMessage, any>

  const childFields = structFieldsOf(child.Model)
  if (Object.hasOwn(childFields, 'session')) {
    throw new SessionReservedFieldError({
      field: 'session',
      programId: child.id,
    })
  }

  const Model = S.Struct({
    ...childFields,
    session: SessionState,
  }) as unknown as ProgramSchema<AppModel>
  const AppMessageSchema = S.Union([
    ...membersOf(child.Message),
    ...Message.members,
  ]) as unknown as ProgramSchema<AppMessage>
  const catalog = Catalog.make([
    ...child.catalog.actions,
    MirrorNavigation,
    KeepNavigationLocal,
  ]) as unknown as SessionCatalogOf<Child>

  const initialSession = SessionState.make({
    mode: config.initialMode ?? 'Mirror',
    generation: 0,
  })

  const childOf = (model: AppModel): ChildModel => {
    const { session: _session, ...childModel } = model
    return childModel as ChildModel
  }

  const withChild = (model: AppModel, childModel: ChildModel): AppModel => ({
    ...childModel,
    session: model.session,
  })

  const init = (): readonly [AppModel, ReadonlyArray<AppCommand>] => {
    const [childModel, commands] = child.init()
    return [
      { ...childModel, session: initialSession },
      commands as ReadonlyArray<AppCommand>,
    ]
  }

  const restore = (
    model: AppModel,
  ): readonly [AppModel, ReadonlyArray<AppCommand>] => {
    if (child.restore === undefined) {
      return [model, []]
    }
    const [childModel, commands] = child.restore(childOf(model))
    return [withChild(model, childModel), commands as ReadonlyArray<AppCommand>]
  }

  const update = (
    model: AppModel,
    message: AppMessage,
  ): readonly [AppModel, ReadonlyArray<AppCommand>] => {
    if (isMessage(message)) {
      return [{ ...model, session: changedSession(model.session, message) }, []]
    }
    const [childModel, commands] = child.update(
      childOf(model),
      message as ChildMessage,
    )
    return [
      withChild(model, childModel),
      mapMessages(commands, commandMessage => commandMessage as AppMessage),
    ]
  }

  const childNavigation = child.navigation
  const childStackOf = childNavigation?.stackOf
  const childSynchronization = child.synchronization
  const childScreen = child.screen

  const program = make({
    id: config.id ?? `session:${child.id}`,
    version: config.version ?? child.version,
    Model,
    Message: AppMessageSchema,
    init,
    restore,
    update,
    catalog,
    ...(childNavigation === undefined
      ? {}
      : {
          navigation: {
            Destination: childNavigation.Destination,
            root: childNavigation.root,
            ...(childStackOf === undefined
              ? {}
              : {
                  stackOf: (model: AppModel) => childStackOf(childOf(model)),
                }),
          },
        }),
    synchronization: {
      messageCategory: message =>
        isMessage(message)
          ? 'Domain'
          : (childSynchronization?.messageCategory(message as ChildMessage) ??
            'Domain'),
      projectDomain: model =>
        childSynchronization === undefined
          ? childOf(model)
          : childSynchronization.projectDomain(childOf(model)),
      sessionPolicyOf: model => policyOf(model.session),
    },
    ...(childScreen === undefined
      ? {}
      : {
          screen: (
            model: AppModel,
            context?: Parameters<NonNullable<Child['screen']>>[1],
          ) => childScreen(childOf(model), context),
        }),
  })

  return Object.assign(program, {
    of: child,
  }) as unknown as SessionProgram<Child>
}
