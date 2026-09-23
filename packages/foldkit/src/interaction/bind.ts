import { Array, Option } from 'effect'

import type { Entry } from '../catalog/catalog.js'
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
 * @example
 * ```typescript
 * const counter = Interaction.bind(SyncedCounter, handle)
 * counter.press('Increment') // sends Increment()
 * counter.pressKey(keyInput('k', { isMeta: true })) // opens the menu
 * ```
 */
export type BoundInteraction<Model, Message> = ProgramHandle<Model, Message> &
  Readonly<{
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
  }>

/** The parts of a Program a Client binds to. */
export type BindableProgram<Model, Message> = Readonly<{
  interaction?: ProgramInteraction<Model, Message>
  screen?: (model: Model) => UiNode
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

  return {
    ...handle,
    status: () =>
      whenInteractive((inner, model) => inner.status(model), Ready()),
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
  }
}
