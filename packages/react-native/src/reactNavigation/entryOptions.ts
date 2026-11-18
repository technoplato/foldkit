import { Option } from 'effect'

import type { AnyBound } from '@foldkit/react/interaction'

import { type Look, lightLook } from '../interaction/look.js'
import {
  type NativePresentation,
  entryOfNavigatorKey,
  presentationOf,
} from './stack.js'

// OPTIONS

/**
 * The native stack options one entry asks for. `title` is empty for an
 * entry without one, because native stack headers fall back to the route
 * name otherwise. The header and the page beneath take the look's
 * colors, so the platform's own chrome is in the Program's mode.
 */
export type EntryOptions = Readonly<{
  presentation: NativePresentation
  headerShown: boolean
  title: string
  headerTintColor: string
  headerShadowVisible: boolean
  headerStyle: Readonly<{ backgroundColor: string }>
  headerTitleStyle: Readonly<{ color: string }>
  contentStyle: Readonly<{ backgroundColor: string }>
}>

/**
 * The native stack options for the entry a navigator's route shows, read
 * from the plan when the stack asks for them: its declared presentation, a header for a card,
 * its declared title, and the look's colors. Both native stacks call it
 * from `screenOptions`, so neither re-renders on a move to keep options
 * current.
 *
 * @example
 * ```typescript
 * entryOptionsOf(bound, '/counter/session', look)
 * // { presentation: 'modal', headerShown: false, title: 'Session', … }
 * entryOptionsOf(bound, '/counter/menu', look)
 * // { presentation: 'transparentModal', headerShown: false, title: 'Actions', … }
 * ```
 */
export const entryOptionsOf = (
  bound: AnyBound,
  key: string,
  look: Look = lightLook,
): EntryOptions => {
  const maybeEntry = Option.flatMap(bound.navigation(), plan =>
    entryOfNavigatorKey(plan, key),
  )
  const presentation = presentationOf(
    Option.flatMap(maybeEntry, entry => entry.maybeStyle),
  )
  const isFloating = presentation === 'transparentModal'
  return {
    presentation,
    headerShown: presentation === 'card',
    title: Option.getOrElse(
      Option.flatMap(maybeEntry, entry => entry.maybeTitle),
      () => '',
    ),
    headerTintColor: look.colors.Text,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: look.colors.PageGround },
    headerTitleStyle: { color: look.colors.Text },
    contentStyle: {
      backgroundColor: isFloating ? 'transparent' : look.colors.PageGround,
    },
  }
}
