import { Array, Option } from 'effect'

import type { AnyBound } from '@foldkit/react/interaction'

import { type NativePresentation, presentationOf } from './stack.js'

// OPTIONS

/** The native stack options one entry asks for. */
export type EntryOptions = Readonly<{
  presentation: NativePresentation
  headerShown: boolean
  title?: string
}>

/**
 * The native stack options for one entry, read from the plan when the
 * stack asks for them: its declared presentation, a header for a card, and
 * its declared title. Both native stacks call it from `screenOptions`, so
 * neither re-renders on a move to keep options current.
 *
 * @example
 * ```typescript
 * entryOptionsOf(bound, '/counter/session')
 * // { presentation: 'card', headerShown: true, title: 'Session' }
 * entryOptionsOf(bound, '/counter/menu')
 * // { presentation: 'transparentModal', headerShown: false, title: 'Actions' }
 * ```
 */
export const entryOptionsOf = (bound: AnyBound, key: string): EntryOptions => {
  const maybeEntry = Option.flatMap(bound.navigation(), plan =>
    Array.findFirst(plan.entries, entry => entry.key === key),
  )
  const presentation = presentationOf(
    Option.flatMap(maybeEntry, entry => entry.maybeStyle),
  )
  return {
    presentation,
    headerShown: presentation === 'card',
    ...Option.match(
      Option.flatMap(maybeEntry, entry => entry.maybeTitle),
      { onNone: () => ({}), onSome: title => ({ title }) },
    ),
  }
}
