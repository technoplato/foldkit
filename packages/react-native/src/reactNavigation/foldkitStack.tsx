import { Array, Option } from 'effect'
import { Navigation } from 'foldkit'
import { type ReactElement, useEffect, useMemo, useState } from 'react'

import { useBound } from '@foldkit/react/interaction'
import { useIsNavigationReady } from '@foldkit/react/navigation'
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native'
import {
  type NativeStackScreenProps,
  createNativeStackNavigator,
} from '@react-navigation/native-stack'

import type { PaintStyles } from '../interaction/screen.js'
import { entryOptionsOf } from './entryOptions.js'
import { EntryStylesContext, EntryView, entryStylesOf } from './entryView.js'
import {
  entryRouteName,
  entryStateOf,
  keyedRoutesOf,
  reactNavigationStack,
} from './stack.js'

// STACK

type ParamList = {
  [entryRouteName]: Readonly<{ uri: string }>
}

const Stack = createNativeStackNavigator<ParamList>()

const EntryScreen = ({
  route,
}: NativeStackScreenProps<ParamList, typeof entryRouteName>): ReactElement => (
  <EntryView entryKey={route.key} />
)

const ReadyStack = ({
  initialRoutes,
  launchUri,
}: Readonly<{
  initialRoutes: Array.NonEmptyReadonlyArray<Navigation.KeyedRoute>
  launchUri: string | undefined
}>): ReactElement => {
  const bound = useBound()
  const navigationRef = useMemo(
    () => createNavigationContainerRef<ParamList>(),
    [],
  )
  const [routesAtMount] = useState(initialRoutes)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!isReady) {
      return undefined
    }
    return Navigation.runCarrier(
      bound,
      Navigation.keyedStackDriver(
        reactNavigationStack(navigationRef, routesAtMount),
      ),
      { launchUri: Option.fromNullishOr(launchUri) },
    )
  }, [bound, isReady, navigationRef, routesAtMount, launchUri])

  return (
    <NavigationContainer
      ref={navigationRef}
      initialState={entryStateOf(routesAtMount)}
      onReady={() => {
        setIsReady(true)
      }}
    >
      <Stack.Navigator
        screenOptions={({ route }) => entryOptionsOf(bound, route.key)}
      >
        <Stack.Screen name={entryRouteName} component={EntryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}

/**
 * The bound Program's navigation as a React Navigation native stack: one
 * keyed route per plan entry, presented by its declared style. A swipe,
 * the header back button, and the Android back button reach the Program
 * as `NavigatedBack`; every Program move resets the stack to its plan,
 * keeping unchanged screens mounted. It renders nothing until the Program
 * is Ready, and after that it re-renders only if readiness changes; each
 * screen repaints its own entry. `launchUri` is a deep link the app
 * opened with.
 *
 * @example
 * ```tsx
 * <ProgramProvider bound={counter}>
 *   <FoldkitStack styles={{ Text: { fontSize: 72 } }} />
 * </ProgramProvider>
 * ```
 */
export const FoldkitStack = ({
  launchUri,
  styles,
}: Readonly<{
  launchUri?: string
  styles?: PaintStyles
}>): ReactElement | null => {
  const bound = useBound()
  const isNavigationReady = useIsNavigationReady()
  const maybeRoutes = isNavigationReady
    ? Option.map(bound.navigation(), keyedRoutesOf)
    : Option.none()
  return Option.match(maybeRoutes, {
    onNone: () => null,
    onSome: initialRoutes => (
      <EntryStylesContext.Provider value={entryStylesOf(styles)}>
        <ReadyStack initialRoutes={initialRoutes} launchUri={launchUri} />
      </EntryStylesContext.Provider>
    ),
  })
}
