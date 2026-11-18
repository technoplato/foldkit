import { Array, Match as M, Option, pipe } from 'effect'

import type { ProgramNavigation, StackedNavigation } from './declaration.js'
import { type Message, NavigatedBack } from './message.js'
import {
  type NavigationStack,
  entriesOf,
  presented,
  stackFrom,
  truncated,
} from './structure.js'
import { parseStack, pathAndUri, pathOf, printStates } from './uri.js'

/**
 * The stack with every Destination's Model-dependent fields recomputed,
 * the ones the URI does not carry, such as the action menu's highlighted
 * row.
 *
 * @example
 * ```typescript
 * settled(navigation, model, parseStack(navigation, '/counter/menu?menu.q=re'))
 * // the menu entry highlights Reset, the first row `re` matches
 * ```
 */
export const settled = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  model: Model,
  stack: NavigationStack<Destination>,
): NavigationStack<Destination> => {
  const settleEntry = navigation.settleEntry
  if (settleEntry === undefined) {
    return stack
  } else {
    return stackFrom(
      settleEntry(model, stack.root),
      Array.map(entriesOf(stack), entry =>
        presented(settleEntry(model, entry.destination), entry.style),
      ),
    )
  }
}

const backTo = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  model: Model,
  stack: NavigationStack<Destination>,
  uri: string,
): NavigationStack<Destination> => {
  const targetPath = pathOf(uri)
  return pipe(
    printStates(navigation, stack),
    Option.flatMap(states =>
      Array.findLastIndex(
        states,
        state => pathAndUri(state).path === targetPath,
      ),
    ),
    Option.match({
      onNone: () => settled(navigation, model, parseStack(navigation, uri)),
      onSome: depth => truncated(stack, depth),
    }),
  )
}

const isAdoptedLaunch = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  model: Model,
  message: Message,
): boolean =>
  message._tag !== 'OpenedUri' ||
  message.via._tag !== 'Launch' ||
  navigation.adoptsLaunch === undefined ||
  navigation.adoptsLaunch(model, message.uri)

/**
 * Folds one carrier fact into a stack. `OpenedUri` adopts the parsed URI,
 * unless it is a launch the declaration does not adopt. `NavigatedBack`
 * truncates to the deepest entry printed at that path and keeps the
 * entries' own values beneath it; with no such entry it adopts the URI
 * like `OpenedUri`. A declaration without routes ignores both facts,
 * because it has no URIs to open.
 *
 * @example
 * ```typescript
 * // stack prints /counter/history/menu?menu.q=re
 * applyMessage(navigation, model, stack, NavigatedBack({ uri: '/counter/history' }))
 * // [Counter, Push History]
 * ```
 */
export const applyMessage = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  model: Model,
  stack: NavigationStack<Destination>,
  message: Message,
): NavigationStack<Destination> => {
  const isAddressable = Array.isReadonlyArrayNonEmpty(navigation.routes)
  if (!isAddressable || !isAdoptedLaunch(navigation, model, message)) {
    return stack
  }
  return M.value(message).pipe(
    M.withReturnType<NavigationStack<Destination>>(),
    M.tagsExhaustive({
      OpenedUri: ({ uri }) =>
        settled(navigation, model, parseStack(navigation, uri)),
      NavigatedBack: ({ uri }) => backTo(navigation, model, stack, uri),
    }),
  )
}

/**
 * Folds one carrier fact into the stack a Model holds. A combinator that
 * owns or extends the stack calls it from `update`.
 *
 * @example
 * ```typescript
 * foldMessage(navigation, model, OpenedUri({ uri: '/counter/session', via: Link() }))
 * // model with navigation [Counter, Push SessionSettings]
 * ```
 */
export const foldMessage = <Model, Destination>(
  navigation: StackedNavigation<Model, Destination>,
  model: Model,
  message: Message,
): Model =>
  Option.match(navigation.stack.get(model), {
    onNone: () => model,
    onSome: stack =>
      navigation.stack.set(
        model,
        applyMessage(navigation, model, stack, message),
      ),
  })

/**
 * The Message that goes back one entry, naming the entry beneath the top.
 * Empty at the root, where Back belongs to the host.
 *
 * @example
 * ```typescript
 * backMessages(navigation, model) // [NavigatedBack({ uri: '/counter' })] on `/counter/session`
 * ```
 */
export const backMessages = <Model, Destination>(
  navigation: StackedNavigation<Model, Destination>,
  model: Model,
): ReadonlyArray<Message> =>
  pipe(
    navigation.stack.get(model),
    Option.flatMap(stack => printStates(navigation, stack)),
    Option.flatMap(states => Array.last(Array.initNonEmpty(states))),
    Option.map(beneath => NavigatedBack({ uri: pathAndUri(beneath).uri })),
    Array.fromOption,
  )
