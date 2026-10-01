import { Array, Match as M, Option, pipe } from 'effect'

import type { ProgramNavigation } from './declaration.js'
import type { Message } from './message.js'
import { type NavigationStack, truncated } from './structure.js'
import { parseStack, pathAndUri, pathOf, printStates } from './uri.js'

/**
 * The stack with Model-dependent fields the URI does not carry
 * recomputed, such as the action menu's highlighted row.
 */
export const settled = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  model: Model,
  stack: NavigationStack<Destination>,
): NavigationStack<Destination> =>
  navigation.settle === undefined ? stack : navigation.settle(model, stack)

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

/**
 * Folds one carrier fact into a stack. `OpenedUri` adopts the parsed URI.
 * `NavigatedBack` truncates to the deepest entry printed at that path and
 * keeps the entries' own values beneath it; with no such entry it adopts
 * the URI like `OpenedUri`.
 *
 * @example
 * ```typescript
 * // stack prints /counter/session/menu?q=re
 * applyMessage(navigation, model, stack, NavigatedBack({ uri: '/counter/session' }))
 * // [Counter, Push SessionSettings]
 * ```
 */
export const applyMessage = <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  model: Model,
  stack: NavigationStack<Destination>,
  message: Message,
): NavigationStack<Destination> =>
  M.value(message).pipe(
    M.withReturnType<NavigationStack<Destination>>(),
    M.tagsExhaustive({
      OpenedUri: ({ uri }) =>
        settled(navigation, model, parseStack(navigation, uri)),
      NavigatedBack: ({ uri }) => backTo(navigation, model, stack, uri),
    }),
  )
