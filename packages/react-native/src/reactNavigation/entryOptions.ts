import { Option } from 'effect'

import type { AnyBound } from '@foldkit/react/interaction'

import { type Look, lightLook } from '../interaction/look.js'
import {
  type NativePresentation,
  entryOfNavigatorKey,
  isCoveredOf,
  presentationOf,
} from './stack.js'

// OPTIONS

/**
 * The native stack options one entry asks for. `title` is empty for an
 * entry without one, because native stack headers fall back to the route
 * name otherwise. The header and the page beneath take the look's
 * colors, so the platform's own chrome is in the Program's mode.
 * `freezeOnBlur` is true for a page another page covers: the stack stops
 * painting it until it is back in sight. A page its route declares a tab,
 * such as a Profile page a tab bar reaches, arrives and leaves with no
 * animation, and has no back button and no swipe back: the tab bar is the
 * way out. The page beneath stays mounted, so it keeps its scroll place.
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
  freezeOnBlur: boolean
  animation?: 'none'
  headerBackVisible?: false
  gestureEnabled?: false
}>

const tabOptions: Pick<
  EntryOptions,
  'animation' | 'headerBackVisible' | 'gestureEnabled'
> = {
  animation: 'none',
  headerBackVisible: false,
  gestureEnabled: false,
}

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
 * entryOptionsOf(bound, '/books/profile', look)
 * // { presentation: 'card', title: 'Profile', animation: 'none',
 * //   headerBackVisible: false, gestureEnabled: false, … }
 * ```
 */
export const entryOptionsOf = (
  bound: Pick<AnyBound, 'navigation'>,
  key: string,
  look: Look = lightLook,
): EntryOptions => {
  const maybePlan = bound.navigation()
  const maybeEntry = Option.flatMap(maybePlan, plan =>
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
    freezeOnBlur: Option.match(maybePlan, {
      onNone: () => false,
      onSome: plan => isCoveredOf(plan, key),
    }),
    ...(Option.exists(maybeEntry, entry => entry.isTab) ? tabOptions : {}),
  }
}
