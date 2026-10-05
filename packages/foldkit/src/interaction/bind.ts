import { Array, Option, Schema as S } from 'effect'

import type { Entry } from '../catalog/catalog.js'
import { type CarrierPlan, planOf } from '../navigation/carrier.js'
import {
  type EntryView,
  type ProgramNavigation,
  screenView,
} from '../navigation/declaration.js'
import { type Frame, documentTitleOf, frameOf } from '../navigation/frame.js'
import { NavigatedBack, OpenedUri, type UriVia } from '../navigation/message.js'
import { type NavigationStack, stackAtRoot } from '../navigation/structure.js'
import {
  canonicalUri as canonicalUriOf,
  ownsUri as ownsUriOf,
} from '../navigation/uri.js'
import { type Host, labelOf } from '../processor/host.js'
import type { ProgramSchema } from '../program/program.js'
import type { UiNode } from '../renderers/types.js'
import {
  type KeyInput,
  type KeyPlatform,
  type MenuOpener,
  type MenuView,
  type ProgramInteraction,
  Ready,
  type Status,
  isBrowserOwnedChord,
  menuOpenerOf,
} from './interaction.js'

/**
 * Runs `send` on behalf of a client on `clientHost`, such as a `books tui`
 * view a CLI daemon answers: every Message sent while `send` runs is
 * recorded as sent for that client, `{ _tag: 'Host', clientHost: { _tag:
 * 'Tui' } }` in the journal, so telemetry records it, its Commands, and
 * their results on the client's surface. `send` must send synchronously;
 * a Message sent later, such as from a timer it started, is the
 * Processor's own.
 */
export type OnBehalfOf = <A>(clientHost: Host, send: () => A) => A

/**
 * A live Program occurrence any Client can read, watch, and send to. React
 * reads it through `useSyncExternalStore`; a CLI reads it once and exits.
 * `host` is the Host it was started on, which names the window.
 * `onBehalfOf`, where a handle has it, sends for a client on another Host;
 * see {@link OnBehalfOf}.
 */
export type ProgramHandle<Model, Message> = Readonly<{
  readModel: () => Model
  subscribe: (listener: () => void) => () => void
  send: (message: Message) => void
  stop: () => Promise<void>
  host?: Host
  onBehalfOf?: OnBehalfOf
}>

/**
 * Runs `send` on behalf of a client on `clientHost` through a handle that
 * can say so, and plainly through one that cannot, such as an inert bound
 * Program. See {@link OnBehalfOf}.
 *
 * @example
 * ```typescript
 * Interaction.onBehalfOf(bound, Processor.Host.Tui(), () => bound.pressKey(input))
 * // the Message the key sends is recorded as sent for a Tui client
 * ```
 */
export const onBehalfOf = <A>(
  handle: Readonly<{ onBehalfOf?: OnBehalfOf }>,
  clientHost: Host,
  send: () => A,
): A =>
  handle.onBehalfOf === undefined ? send() : handle.onBehalfOf(clientHost, send)

/**
 * A Program's interaction joined to one live handle. Every function reads
 * the current Model, sends the resulting Messages in order, and returns
 * whether it sent anything, so a keyboard Client knows when to prevent the
 * default.
 *
 * The navigation facet is what every carrier reads and reports to:
 * `navigation` is the plan, None until the Program is Ready; `viewAt`
 * paints one entry by key; `openUri` and `navigateBack` send the carrier
 * facts. A bound Program is the `CarrierSource` `runCarrier` drives.
 *
 * @example
 * ```typescript
 * const counter = Interaction.bind(SyncedCounter, handle)
 * counter.windowTitle() // 'Counter | React'
 * counter.press('Increment') // sends Increment()
 * counter.pressKey(keyInput('k', { isMeta: true })) // opens the menu
 * counter.openUri('/counter/session', Navigation.Link()) // pushes Session
 * ```
 */
export type BoundInteraction<Model, Message> = ProgramHandle<Model, Message> &
  Readonly<{
    programId: Option.Option<string>
    appLabel: string
    windowTitle: () => string
    menuKeys: () => ReadonlyArray<KeyInput>
    menuOpener: (platform: KeyPlatform) => Option.Option<MenuOpener>
    status: () => Status
    screen: () => Option.Option<UiNode>
    entries: () => ReadonlyArray<Entry>
    menu: () => Option.Option<MenuView>
    press: (tag: string) => boolean
    pressKey: (input: KeyInput) => boolean
    openMenu: () => boolean
    dismissMenu: () => boolean
    typeInMenu: (query: string) => boolean
    chooseFromMenu: (tag: string) => boolean
    navigation: () => Option.Option<CarrierPlan<unknown>>
    viewAt: (key: string) => Option.Option<EntryView>
    canonicalUri: (uri: string) => Option.Option<string>
    ownsUri: (uri: string) => boolean
    openUri: (uri: string, via: UriVia) => boolean
    navigateBack: (uri: string) => boolean
  }>

const fallbackAppLabel = 'Foldkit'

/**
 * The parts of a Program a Client binds to. `id` lets typed hooks check
 * they read the Program the nearest provider bound.
 */
export type BindableProgram<Model, Message> = Readonly<{
  id?: string
  Message?: ProgramSchema<Message>
  interaction?: ProgramInteraction<Model, Message>
  screen?: (model: Model) => UiNode
  navigation?: ProgramNavigation<Model, any>
}>

/**
 * Joins a Program's interaction to a live handle. A Program without an
 * interaction binds as inert: Ready, no entries, and presses send nothing.
 */
export const bind = <Model, Message>(
  program: BindableProgram<Model, Message>,
  handle: ProgramHandle<Model, Message>,
): BoundInteraction<Model, Message> => {
  const interaction = program.interaction
  const screen = program.screen
  const declaration: ProgramNavigation<Model, unknown> | undefined =
    program.navigation

  const sendAll = (messages: ReadonlyArray<Message>): boolean => {
    Array.forEach(messages, message => {
      handle.send(message)
    })
    return Array.isReadonlyArrayNonEmpty(messages)
  }

  const whenInteractive = <A>(
    read: (inner: ProgramInteraction<Model, Message>, model: Model) => A,
    otherwise: A,
  ): A =>
    interaction === undefined
      ? otherwise
      : read(interaction, handle.readModel())

  const status = (): Status =>
    whenInteractive((inner, model) => inner.status(model), Ready())

  const isReady = (): boolean => status()._tag === 'Ready'

  const stackOf = (
    navigation: ProgramNavigation<Model, unknown>,
    model: Model,
  ): Option.Option<NavigationStack<unknown>> =>
    navigation.stack === undefined
      ? Option.some(stackAtRoot(navigation.root))
      : navigation.stack.get(model)

  const plan = (): Option.Option<CarrierPlan<unknown>> => {
    if (declaration === undefined || !isReady()) {
      return Option.none()
    }
    const model = handle.readModel()
    return Option.flatMap(stackOf(declaration, model), stack =>
      planOf(declaration, model, stack),
    )
  }

  const viewAt = (key: string): Option.Option<EntryView> =>
    Option.flatMap(plan(), currentPlan =>
      Option.flatMap(
        Array.findFirst(currentPlan.entries, entry => entry.key === key),
        entry => {
          const model = handle.readModel()
          const isRoot =
            entry.key === Array.headNonEmpty(currentPlan.entries).key
          const declared =
            declaration?.viewOf === undefined
              ? Option.none()
              : declaration.viewOf(model, entry.destination)
          return Option.orElse(declared, () =>
            isRoot && screen !== undefined
              ? Option.some(screenView(screen(model)))
              : Option.none(),
          )
        },
      ),
    )

  const isProgramMessage =
    program.Message === undefined
      ? (_fact: unknown): _fact is Message => false
      : S.is(program.Message)

  const appLabel = Option.match(Option.fromNullishOr(handle.host), {
    onNone: () => fallbackAppLabel,
    onSome: labelOf,
  })

  const windowTitle = (): string => {
    const currentStatus = status()
    const maybeStatusTitle =
      currentStatus._tag === 'Ready'
        ? Option.none()
        : Option.some(currentStatus.description)
    return documentTitleOf(
      Option.orElse(
        Option.flatMap(
          frameOf({ navigation: plan, viewAt }),
          frame => frame.maybeTitle,
        ),
        () => maybeStatusTitle,
      ),
      appLabel,
    )
  }

  const sendFact = (fact: OpenedUri | NavigatedBack): boolean => {
    if (Option.isSome(plan()) && isProgramMessage(fact)) {
      handle.send(fact)
      return true
    } else {
      return false
    }
  }

  return {
    ...handle,
    programId: Option.fromNullishOr(program.id),
    appLabel,
    windowTitle,
    menuKeys: () => (interaction === undefined ? [] : interaction.menuKeys),
    menuOpener: platform =>
      interaction === undefined || !isReady()
        ? Option.none()
        : menuOpenerOf(interaction, platform),
    status,
    screen: () =>
      screen === undefined
        ? Option.none()
        : Option.some(screen(handle.readModel())),
    entries: () => whenInteractive((inner, model) => inner.entries(model), []),
    menu: () =>
      whenInteractive((inner, model) => inner.menu(model), Option.none()),
    press: tag =>
      sendAll(whenInteractive((inner, model) => inner.press(model, tag), [])),
    pressKey: input =>
      !isBrowserOwnedChord(input) &&
      sendAll(
        whenInteractive((inner, model) => inner.pressKey(model, input), []),
      ),
    openMenu: () =>
      sendAll(whenInteractive((inner, model) => inner.openMenu(model), [])),
    dismissMenu: () =>
      sendAll(whenInteractive((inner, model) => inner.dismissMenu(model), [])),
    typeInMenu: query =>
      sendAll(
        whenInteractive((inner, model) => inner.typeInMenu(model, query), []),
      ),
    chooseFromMenu: tag =>
      sendAll(
        whenInteractive((inner, model) => inner.chooseFromMenu(model, tag), []),
      ),
    navigation: plan,
    viewAt,
    canonicalUri: uri =>
      declaration === undefined
        ? Option.none()
        : canonicalUriOf(declaration, uri),
    ownsUri: uri => declaration !== undefined && ownsUriOf(declaration, uri),
    openUri: (uri, via) => sendFact(OpenedUri({ uri, via })),
    navigateBack: uri => sendFact(NavigatedBack({ uri })),
  }
}

/**
 * The navigation frame a pure view paints for one Model: the same frame a
 * bound Program shows, for a host that renders from the Model it is given
 * instead of a live handle, such as a Foldkit HTML view.
 *
 * @example
 * ```typescript
 * frameOfModel(SyncedCounter, model)
 * // Some({ uri: '/counter/session', maybeTitle: Some('Session'), base, overlays: [] })
 * ```
 */
export const frameOfModel = <Model, Message>(
  program: BindableProgram<Model, Message>,
  model: Model,
): Option.Option<Frame> => frameOf(bindModel(program, model))

/**
 * The window title a pure view shows for one Model on `host`: the same
 * title a bound Program gives, for a host that renders from the Model it
 * is given, such as a Foldkit HTML view.
 *
 * @example
 * ```typescript
 * windowTitleOfModel(SyncedCounter, model, Processor.Host.Foldkit())
 * // 'Session | Foldkit HTML', or 'Starting Counter… | Foldkit HTML' while Starting
 * ```
 */
export const windowTitleOfModel = <Model, Message>(
  program: BindableProgram<Model, Message>,
  model: Model,
  host: Host,
): string => bindModel(program, model, host).windowTitle()

const bindModel = <Model, Message>(
  program: BindableProgram<Model, Message>,
  model: Model,
  host?: Host,
): BoundInteraction<Model, Message> =>
  bind(program, {
    readModel: () => model,
    subscribe: () => () => {},
    send: () => {},
    stop: () => Promise.resolve(),
    ...(host === undefined ? {} : { host }),
  })

const millisecondsPerSecond = 1000

/**
 * Resolves once a bound Program is no longer Starting, so a one-shot
 * Client such as a CLI command paints a real count. Rejects after
 * `timeoutMs` with the Program's own Starting description.
 *
 * @example
 * ```typescript
 * await whenSettled(counter, 20_000)
 * // rejects with 'Still Starting Counter… after 20 seconds.' if it never settles
 * ```
 */
export const whenSettled = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  timeoutMs: number,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stopListening()
      const status = bound.status()
      reject(
        new Error(
          `Still ${status._tag === 'Starting' ? status.description : 'starting'} after ${(timeoutMs / millisecondsPerSecond).toString()} seconds.`,
        ),
      )
    }, timeoutMs)
    const settle = (): void => {
      if (bound.status()._tag !== 'Starting') {
        clearTimeout(timeout)
        stopListening()
        resolve()
      }
    }
    const stopListening = bound.subscribe(settle)
    settle()
  })
