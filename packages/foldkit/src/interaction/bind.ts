import { Array, Option, Schema as S } from 'effect'

import type { Entry } from '../catalog/catalog.js'
import { type CarrierPlan, planOf } from '../navigation/carrier.js'
import {
  type EntryView,
  type ProgramNavigation,
  screenView,
} from '../navigation/declaration.js'
import { NavigatedBack, OpenedUri, type UriVia } from '../navigation/message.js'
import { type NavigationStack, stackAtRoot } from '../navigation/structure.js'
import { canonicalUri as canonicalUriOf } from '../navigation/uri.js'
import type { ProgramSchema } from '../program/program.js'
import type { UiNode } from '../renderers/types.js'
import {
  type KeyInput,
  type MenuView,
  type ProgramInteraction,
  Ready,
  type Status,
} from './interaction.js'

/**
 * A live Program occurrence any Client can read, watch, and send to. React
 * reads it through `useSyncExternalStore`; a CLI reads it once and exits.
 */
export type ProgramHandle<Model, Message> = Readonly<{
  readModel: () => Model
  subscribe: (listener: () => void) => () => void
  send: (message: Message) => void
  stop: () => Promise<void>
}>

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
 * counter.press('Increment') // sends Increment()
 * counter.pressKey(keyInput('k', { isMeta: true })) // opens the menu
 * counter.openUri('/counter/session', Navigation.Link()) // pushes Session
 * ```
 */
export type BoundInteraction<Model, Message> = ProgramHandle<Model, Message> &
  Readonly<{
    programId: Option.Option<string>
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
    openUri: (uri: string, via: UriVia) => boolean
    navigateBack: (uri: string) => boolean
  }>

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
    openUri: (uri, via) => sendFact(OpenedUri({ uri, via })),
    navigateBack: uri => sendFact(NavigatedBack({ uri })),
  }
}
