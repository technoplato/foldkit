import { Array, Option } from 'effect'
import { Stack, useNavigationContainerRef, useRoute } from 'expo-router'
import { Navigation } from 'foldkit'
import { type ReactElement, useEffect, useState } from 'react'

import { useBound } from '@foldkit/react/interaction'
import { useIsNavigationReady } from '@foldkit/react/navigation'

import type { PaintStyles } from '../interaction/screen.js'
import { entryOptionsOf } from '../reactNavigation/entryOptions.js'
import {
  EntryStylesContext,
  EntryView,
  entryStylesOf,
} from '../reactNavigation/entryView.js'
import { keyedRoutesOf } from '../reactNavigation/stack.js'
import { expoRouterStack } from './routerStack.js'

// LAYOUT

const useIsContainerReady = (
  ref: ReturnType<typeof useNavigationContainerRef>,
): boolean => {
  const [isReady, setIsReady] = useState(() => ref.isReady())
  useEffect(() => {
    if (isReady) {
      return undefined
    }
    if (ref.isReady()) {
      setIsReady(true)
      return undefined
    }
    return ref.addListener('state', () => {
      if (ref.isReady()) {
        setIsReady(true)
      }
    })
  }, [ref, isReady])
  return isReady
}

/**
 * The root layout of an Expo Router app whose screens a Foldkit Program
 * declares. It renders Expo Router's Stack and keeps it on the bound
 * Program's plan: one keyed route per entry through `app/[...path].tsx`,
 * presented by its declared style. A URL Expo Router opened with launches
 * once the Program is Ready, and a swipe or the Android back button reaches
 * the Program as `NavigatedBack`.
 *
 * @example
 * ```tsx
 * // app/_layout.tsx
 * export default function Layout() {
 *   return (
 *     <ProgramProvider bound={bound}>
 *       <FoldkitRouterStack />
 *     </ProgramProvider>
 *   )
 * }
 * // app/[...path].tsx and app/index.tsx
 * export { FoldkitRouterScreen as default } from '@foldkit/react-native/expo-router'
 * ```
 */
export const FoldkitRouterStack = ({
  styles,
}: Readonly<{ styles?: PaintStyles }>): ReactElement => {
  const bound = useBound()
  const ref = useNavigationContainerRef()
  const isContainerReady = useIsContainerReady(ref)
  const isPlanReady = useIsNavigationReady()

  useEffect(() => {
    if (!isContainerReady || !isPlanReady) {
      return undefined
    }
    return Option.match(bound.navigation(), {
      onNone: () => undefined,
      onSome: plan => {
        const stack = expoRouterStack(ref, keyedRoutesOf(plan))
        return Navigation.runCarrier(
          bound,
          Navigation.keyedStackDriver(stack),
          { launchUri: Option.some(Array.lastNonEmpty(stack.routes()).uri) },
        )
      },
    })
  }, [bound, ref, isContainerReady, isPlanReady])

  return (
    <EntryStylesContext.Provider value={entryStylesOf(styles)}>
      <Stack screenOptions={({ route }) => entryOptionsOf(bound, route.key)} />
    </EntryStylesContext.Provider>
  )
}

// SCREEN

/**
 * The screen every Foldkit route file renders: it paints the stack entry
 * its route was written with. Export it as the default of
 * `app/[...path].tsx` and `app/index.tsx`.
 */
export const FoldkitRouterScreen = (): ReactElement => (
  <EntryView entryKey={useRoute().key} />
)
