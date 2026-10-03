import { Array, Data, Match as M, Option, Predicate, Schema as S } from 'effect'

import { isActionMenu } from '../actionMenu/actionMenu.js'
import * as Catalog from '../catalog/catalog.js'
import type { AnyCatalog, CatalogOf } from '../catalog/catalog.js'
import { mapMessages } from '../command/index.js'
import {
  type ProgramInteraction,
  fromCatalog,
} from '../interaction/interaction.js'
import {
  type DestinationOf,
  composeNavigation,
  composedDestination,
  composedFields,
  fieldLens,
  holdOf,
  ownedMessages,
  schemaMembersOf,
} from '../navigation/compose.js'
import {
  type EntryView,
  type NotFound,
  pushRoute,
  screenView,
  tagCase,
} from '../navigation/declaration.js'
import * as NavigationMessage from '../navigation/message.js'
import {
  type NavigationStack,
  Push,
  entriesOf,
  presented,
  pushed,
  stackAtRoot,
  truncated,
} from '../navigation/structure.js'
import { backMessages, foldMessage, settled } from '../navigation/transition.js'
import { type Host, labelOf } from '../processor/host.js'
import type {
  MessageOf,
  ModelOf,
  Program,
  ProgramCommand,
  ProgramNavigation,
  ProgramSchema,
} from '../program/program.js'
import { make } from '../program/program.js'
import { Column, Row, Text, actionButtons } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'
import * as Route from '../route/parser.js'
import { ts } from '../schema/index.js'
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

/**
 * A person chose to show the same screen on every device in the session.
 * Every device returns to the first screen at this log position, so the
 * devices that kept their own screens meet again: a laptop on
 * `/counter/session` and a phone on `/counter` both land on `/counter`.
 */
export const MirrorNavigation = Catalog.action('MirrorNavigation', {
  what: 'Shows the same screen on every device, starting from the first screen',
  why: 'The person wants every device to go where they go',
  enabled: (model: SessionModel) =>
    model.session.mode === 'Mirror'
      ? Catalog.Disabled({ because: 'navigation is already mirrored' })
      : Catalog.Enabled(),
  meta: { label: 'Mirror navigation', keys: ['m'] },
})

/** A person chose to keep each device on its own screen. */
export const KeepNavigationLocal = Catalog.action('KeepNavigationLocal', {
  what: 'Keeps each device on its own screen while the domain syncs',
  why: 'The person wants to move around without moving everyone else',
  enabled: (model: SessionModel) =>
    model.session.mode === 'SharedDomain'
      ? Catalog.Disabled({ because: 'navigation already stays on each device' })
      : Catalog.Enabled(),
  meta: { label: 'Keep navigation local', keys: ['l'] },
})

// SETTINGS

/**
 * The pushed page that shows how the session shares navigation and lets a
 * person change it. It prints as `session` above the entry beneath it:
 * `/counter/session`.
 */
export const SessionSettings = ts('SessionSettings')
/** The Session settings page. */
export type SessionSettings = typeof SessionSettings.Type

/** True for the Session settings page. */
export const isSessionSettings = S.is(SessionSettings)

type NavigationModel = Readonly<{ navigation: NavigationStack<unknown> }>

const settingsDepthOf = (
  stack: NavigationStack<unknown>,
): Option.Option<number> =>
  Array.findFirstIndex(entriesOf(stack), entry =>
    isSessionSettings(entry.destination),
  )

const isSettingsOpen = (model: NavigationModel): boolean =>
  Option.isSome(settingsDepthOf(model.navigation))

/** A person opened the Session settings page. */
export const OpenSessionSettings = Catalog.action('OpenSessionSettings', {
  what: 'Shows how this session shares navigation',
  why: 'The person wants to see or change whether every device follows',
  enabled: (model: NavigationModel) =>
    isSettingsOpen(model)
      ? Catalog.Disabled({ because: 'session settings are already open' })
      : Catalog.Enabled(),
  meta: { label: 'Session settings', keys: ['s'] },
})

/** A person closed the Session settings page. */
export const CloseSessionSettings = Catalog.action('CloseSessionSettings', {
  what: 'Returns to the screen beneath the session settings',
  why: 'The person is done with the session settings',
  enabled: (model: NavigationModel) =>
    isSettingsOpen(model)
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'session settings are not open' }),
  meta: { label: 'Close', keys: [] },
})

const isAboveRoot = (model: NavigationModel): boolean =>
  Array.some(
    entriesOf(model.navigation),
    entry => !isActionMenu(entry.destination),
  )

/**
 * A person went back to the screen beneath the one on top: a page closes,
 * or a dialog over it does. Escape presses it, and the top page shows it
 * as a Back button, so every host can go back, a terminal included: on
 * `/counters/3`, Back lands on `/counters`.
 */
export const GoBack = Catalog.action('GoBack', {
  what: 'Returns to the screen beneath this one',
  why: 'The person is done with this screen',
  enabled: (model: NavigationModel) =>
    isAboveRoot(model)
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'this is the first screen' }),
  meta: { label: 'Back', keys: ['Escape'], title: 'Back' },
})

/** Every session Message. */
export const Message = S.Union([
  MirrorNavigation,
  KeepNavigationLocal,
  OpenSessionSettings,
  CloseSessionSettings,
  GoBack,
])
/** A session Message. */
export type Message = typeof Message.Type

/** True for the session Messages. */
export const isMessage = S.is(Message)

const ModeMessage = S.Union([MirrorNavigation, KeepNavigationLocal])
type ModeMessage = typeof ModeMessage.Type
const isModeMessage = S.is(ModeMessage)

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
  message: ModeMessage,
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

// SCREEN

const modeSentence = (mode: SessionMode): string =>
  M.value(mode).pipe(
    M.withReturnType<string>(),
    M.when('Mirror', () => 'Every device shows the same screen.'),
    M.when(
      'SharedDomain',
      () => 'Each device keeps its own screen. Shared data still syncs.',
    ),
    M.exhaustive,
  )

const openerCatalog = Catalog.make([OpenSessionSettings])

const sessionActionsCatalog = Catalog.make([
  GoBack,
  MirrorNavigation,
  KeepNavigationLocal,
  OpenSessionSettings,
  CloseSessionSettings,
])

const backCatalog = Catalog.make([GoBack])

const settingsCatalog = Catalog.make([
  MirrorNavigation,
  KeepNavigationLocal,
  CloseSessionSettings,
])

/**
 * Another app that joins this session: the Host it runs on, the command
 * that starts it from the repository root, and, for a web app, where it
 * opens. A Program declares its companions once, and the Session page
 * lists them for every painter.
 *
 * @example
 * ```typescript
 * const tui: Session.Companion = {
 *   host: Processor.Host.Tui(),
 *   command: 'pnpm --filter counter-tui-example start',
 * }
 * ```
 */
export type Companion = Readonly<{
  host: Host
  command: string
  url?: string
}>

const companionsHeading = 'Join this session from another app'

const companionNode = (companion: Companion): UiNode =>
  Row(
    {},
    Text(
      labelOf(companion.host),
      companion.url === undefined ? {} : { href: companion.url },
    ),
    Text(companion.command, { mono: true, copyable: true }),
  )

const companionsNodes = (
  companions: ReadonlyArray<Companion>,
): ReadonlyArray<UiNode> =>
  Array.match(companions, {
    onEmpty: () => [],
    onNonEmpty: nonEmpty => [
      Text(companionsHeading, { dim: true }),
      ...Array.map(nonEmpty, companionNode),
    ],
  })

/**
 * The Session settings page every painter draws: the mode in one sentence,
 * a button for each settings Action, then one line per companion app with
 * the command that starts it, copyable, so another window joins in one
 * paste. A web companion's name links to where it opens.
 *
 * @example
 * ```typescript
 * sessionScreen({ session: { mode: 'Mirror', generation: 0 }, navigation }, companions)
 * // Column: Text('Session'), Text('Every device shows the same screen.'),
 * //   Row: [Mirror navigation (disabled)] [Keep navigation local] [Close],
 * //   Text('Join this session from another app'),
 * //   Row: Text('React', href '/counter'), Text('pnpm --filter counter-react-example start', copyable),
 * //   Row: Text('TUI'), Text('pnpm --filter counter-tui-example start', copyable)
 * ```
 */
export const sessionScreen = (
  model: SessionModel & NavigationModel,
  companions: ReadonlyArray<Companion> = [],
): UiNode =>
  Column(
    {},
    Text('Session', { label: 'Session settings', emphasis: 'Display' }),
    Text(modeSentence(model.session.mode), { dim: true }),
    Row({}, ...actionButtons(Catalog.entries(settingsCatalog, model))),
    ...companionsNodes(companions),
  )

// COMPOSE

/** A composed child's Model had the field the combinator reserves. */
export class SessionReservedFieldError extends Data.TaggedError(
  'SessionReservedFieldError',
)<{
  readonly field: string
  readonly programId: string
}> {}

/** A child could not be composed because it declares no navigation. */
export class SessionChildIncompleteError extends Data.TaggedError(
  'SessionChildIncompleteError',
)<{
  readonly missing: 'navigation'
  readonly programId: string
}> {}

/** Any Program with a Catalog and navigation that a session can wrap. */
export type SessionChild = Program<any, any, any, any, any> &
  Readonly<{
    catalog: AnyCatalog
    navigation?: ProgramNavigation<any, any>
  }>

/** The Destinations of a session: the child's, Session settings, NotFound. */
export type SessionDestinationOf<Child extends SessionChild> =
  | DestinationOf<Child>
  | SessionSettings
  | NotFound

/**
 * The composed Model: the child's fields, flat, plus `session` and the
 * navigation stack.
 */
export type SessionModelOf<Child extends SessionChild> = Omit<
  ModelOf<Child>,
  'navigation'
> &
  SessionModel &
  Readonly<{ navigation: NavigationStack<SessionDestinationOf<Child>> }>

/**
 * The composed Message: the child's Messages, the session Messages, and
 * the carrier facts.
 */
export type SessionMessageOf<Child extends SessionChild> =
  | MessageOf<Child>
  | Message
  | NavigationMessage.Message

/** The composed Catalog: the child's Actions, then the session Actions. */
export type SessionCatalogOf<Child extends SessionChild> = Catalog.Catalog<
  readonly [
    ...CatalogOf<Child>['actions'],
    typeof MirrorNavigation,
    typeof KeepNavigationLocal,
    typeof OpenSessionSettings,
    typeof CloseSessionSettings,
    typeof GoBack,
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

/**
 * Wraps a Program with a Catalog and navigation in session state every
 * Processor folds from the log, and in the navigation stack its devices
 * share or keep. The session's mode decides who applies Navigation
 * Messages: under Mirror every device follows; under SharedDomain each
 * device keeps its own screen while the domain syncs. A mode change is an
 * ordinary logged Action, so every Processor switches at the same log
 * position, and two tabs can never disagree about the mode.
 *
 * The stack starts at the child's root and prints under its slug. Session
 * adds the settings page at `/session`, a `Session settings` button under
 * the child's screen, a NotFound fallback for any other path, and a Back
 * Action, `GoBack`, that Escape presses and the top page shows as a
 * button. Its Actions have keys, `s` to open the settings and `m` and
 * `l` to change the mode, so a terminal reaches them without a mouse. The
 * child's own interaction stays in charge of its Actions, so a Program
 * whose buttons carry their row, such as `Increment:counter-2`, keeps
 * them; the session's Actions follow. While navigation is mirrored, a launch URI
 * does not move the stack: a newcomer joins the shared screen. Compose it
 * inside `ActionMenu.compose` so the session Actions appear in the menu.
 *
 * @example
 * ```typescript
 * const App = ActionMenu.compose({ of: Session.compose({ of: CounterProgram }) })
 * // App.Model: { count, session: { mode: 'Mirror', generation: 0 }, navigation }
 * // OpenSessionSettings pushes `/counter/session`
 * ```
 */
export const compose = <Child extends SessionChild>(config: {
  of: Child
  initialMode?: SessionMode
  companions?: ReadonlyArray<Companion>
  id?: string
  version?: number
}): SessionProgram<Child> => {
  const child = config.of
  type ChildModel = ModelOf<Child>
  type ChildMessage = MessageOf<Child>
  type AppModel = SessionModelOf<Child>
  type AppMessage = SessionMessageOf<Child> & Readonly<{ _tag: string }>
  type AppDestination = SessionDestinationOf<Child>
  type AppCommand = ProgramCommand<AppMessage, any>

  const childNavigation = child.navigation
  if (childNavigation === undefined) {
    throw new SessionChildIncompleteError({
      missing: 'navigation',
      programId: child.id,
    })
  }
  const hold = holdOf(childNavigation)
  const childFields = structFieldsOf(child.Model)
  if (Object.hasOwn(childFields, 'session')) {
    throw new SessionReservedFieldError({
      field: 'session',
      programId: child.id,
    })
  }
  if (hold === 'Owns' && Object.hasOwn(childFields, 'navigation')) {
    throw new SessionReservedFieldError({
      field: 'navigation',
      programId: child.id,
    })
  }

  const Destination = composedDestination(
    childNavigation,
    [SessionSettings],
    hold,
  )
  const Model = S.Struct({
    ...composedFields(childFields, Destination),
    session: SessionState,
  }) as unknown as ProgramSchema<AppModel>
  const AppMessageSchema = S.Union([
    ...schemaMembersOf(child.Message),
    ...Message.members,
    ...ownedMessages(hold),
  ]) as unknown as ProgramSchema<AppMessage>
  const catalog = Catalog.make([
    ...child.catalog.actions,
    MirrorNavigation,
    KeepNavigationLocal,
    OpenSessionSettings,
    CloseSessionSettings,
    GoBack,
  ]) as unknown as SessionCatalogOf<Child>

  const initialSession = SessionState.make({
    mode: config.initialMode ?? 'Mirror',
    generation: 0,
  })

  const childOf = (model: AppModel): ChildModel => {
    const { session: _session, navigation, ...childFieldsOnly } = model
    return (
      hold === 'Owns' ? childFieldsOnly : { ...childFieldsOnly, navigation }
    ) as ChildModel
  }

  const withChild = (model: AppModel, childModel: ChildModel): AppModel =>
    (hold === 'Owns'
      ? {
          ...childModel,
          session: model.session,
          navigation: model.navigation,
        }
      : { ...childModel, session: model.session }) as AppModel

  const sessionSettingsRoute = pushRoute(
    Route.caseOf(
      Route.literal('session'),
      tagCase<AppDestination, SessionSettings>(
        isSessionSettings,
        SessionSettings,
      ),
    ),
    {
      isAllowedAbove: beneath => !Array.some(beneath, isSessionSettings),
      title: () => 'Session',
    },
  )

  const composedNavigation = composeNavigation<
    AppModel,
    ChildModel,
    AppDestination,
    DestinationOf<Child>
  >({
    child: childNavigation,
    hold,
    Destination: Destination as unknown as ProgramSchema<AppDestination>,
    childOf,
    stack: fieldLens<AppModel, AppDestination>(),
    embedNotFound: notFound => notFound,
    routes: [sessionSettingsRoute],
    viewOf: (model, destination) =>
      isSessionSettings(destination)
        ? Option.some(screenView(sessionScreen(model, config.companions)))
        : Option.none(),
    adoptsLaunch: model => model.session.mode !== 'Mirror',
  })

  const isSameDestination = S.toEquivalence(composedNavigation.Destination)

  const isTopPage = (model: AppModel, destination: AppDestination): boolean =>
    !isSessionSettings(destination) &&
    Option.exists(Array.last(model.navigation.pages), page =>
      isSameDestination(page, destination),
    )

  const withBackButton = (model: AppModel, view: EntryView): EntryView =>
    view._tag === 'Screen'
      ? screenView(
          Column(
            {},
            Row({}, ...actionButtons(Catalog.entries(backCatalog, model))),
            view.node,
          ),
        )
      : view

  const composedViewOf =
    composedNavigation.viewOf ?? ((): Option.Option<EntryView> => Option.none())

  const navigation: typeof composedNavigation = {
    ...composedNavigation,
    viewOf: (model, destination) =>
      Option.map(composedViewOf(model, destination), view =>
        isTopPage(model, destination) ? withBackButton(model, view) : view,
      ),
  }

  const openedSettings = (model: AppModel): AppModel =>
    isSettingsOpen(model)
      ? model
      : {
          ...model,
          navigation: pushed<AppDestination>(
            model.navigation,
            presented<AppDestination>(SessionSettings(), Push()),
          ),
        }

  const closedSettings = (model: AppModel): AppModel =>
    Option.match(settingsDepthOf(model.navigation), {
      onNone: () => model,
      onSome: depth => ({
        ...model,
        navigation: truncated(model.navigation, depth),
      }),
    })

  const withMode = (model: AppModel, message: ModeMessage): AppModel => ({
    ...model,
    session: changedSession(model.session, message),
  })

  const mirrored = (model: AppModel, message: ModeMessage): AppModel => {
    const switched = withMode(model, message)
    return {
      ...switched,
      navigation: settled(
        navigation,
        switched,
        stackAtRoot<AppDestination>(childNavigation.root),
      ),
    }
  }

  const wentBack = (model: AppModel): AppModel =>
    Array.reduce(backMessages(navigation, model), model, (current, back) =>
      foldMessage(navigation, current, back),
    )

  const updateSession = (model: AppModel, message: Message): AppModel => {
    if (message._tag === 'GoBack') {
      return wentBack(model)
    } else if (message._tag === 'MirrorNavigation') {
      return mirrored(model, message)
    } else if (isModeMessage(message)) {
      return withMode(model, message)
    } else if (message._tag === 'OpenSessionSettings') {
      return openedSettings(model)
    } else {
      return closedSettings(model)
    }
  }

  const init = (): readonly [AppModel, ReadonlyArray<AppCommand>] => {
    const [childModel, commands] = child.init()
    const initialNavigation =
      hold === 'Owns'
        ? stackAtRoot<AppDestination>(childNavigation.root)
        : childModel.navigation
    return [
      {
        ...childModel,
        session: initialSession,
        navigation: initialNavigation,
      } as AppModel,
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
    if (NavigationMessage.isMessage(message)) {
      return [foldMessage(navigation, model, message), []]
    }
    if (isMessage(message)) {
      return [updateSession(model, message), []]
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

  const settingsInteraction = fromCatalog(
    sessionActionsCatalog,
  ) as unknown as ProgramInteraction<AppModel, AppMessage>

  const childInteraction = (child.interaction ??
    fromCatalog(child.catalog)) as unknown as ProgramInteraction<
    ChildModel,
    ChildMessage
  >

  const asAppMessages = (
    messages: ReadonlyArray<ChildMessage>,
  ): ReadonlyArray<AppMessage> => messages as ReadonlyArray<AppMessage>

  const interaction: ProgramInteraction<AppModel, AppMessage> = {
    menuTitle: childInteraction.menuTitle,
    menuKeys: childInteraction.menuKeys,
    status: model => childInteraction.status(childOf(model)),
    entries: model => [
      ...childInteraction.entries(childOf(model)),
      ...settingsInteraction.entries(model),
    ],
    press: (model, tag) =>
      Array.match(asAppMessages(childInteraction.press(childOf(model), tag)), {
        onEmpty: () => settingsInteraction.press(model, tag),
        onNonEmpty: messages => messages,
      }),
    pressKey: (model, input) =>
      Array.match(
        asAppMessages(childInteraction.pressKey(childOf(model), input)),
        {
          onEmpty: () => settingsInteraction.pressKey(model, input),
          onNonEmpty: messages => messages,
        },
      ),
    menu: model => childInteraction.menu(childOf(model)),
    openMenu: model => asAppMessages(childInteraction.openMenu(childOf(model))),
    dismissMenu: model =>
      asAppMessages(childInteraction.dismissMenu(childOf(model))),
    typeInMenu: (model, query) =>
      asAppMessages(childInteraction.typeInMenu(childOf(model), query)),
    chooseFromMenu: (model, tag) =>
      asAppMessages(childInteraction.chooseFromMenu(childOf(model), tag)),
  }

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
    interaction,
    navigation,
    synchronization: {
      messageCategory: message => {
        if (isModeMessage(message)) {
          return 'Domain'
        } else if (isMessage(message)) {
          return 'Navigation'
        } else if (hold === 'Owns' && NavigationMessage.isMessage(message)) {
          return 'Navigation'
        } else {
          return (
            childSynchronization?.messageCategory(message as ChildMessage) ??
            'Domain'
          )
        }
      },
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
          ) =>
            Column(
              {},
              childScreen(childOf(model), context),
              Row({}, ...actionButtons(Catalog.entries(openerCatalog, model))),
            ),
        }),
  })

  return Object.assign(program, {
    of: child,
  }) as unknown as SessionProgram<Child>
}
