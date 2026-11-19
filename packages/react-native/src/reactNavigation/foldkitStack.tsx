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

import { HeaderMenuButton } from '../interaction/actionMenuModal.js'
import type { PaintStyles } from '../interaction/paint.js'
import { WhenReady } from '../interaction/whenReady.js'
import { useLook } from '../theme/themed.js'
import { entryOptionsOf } from './entryOptions.js'
import { EntryStylesContext, EntryView, entryStylesOf } from './entryView.js'
import {
  entryStateOf,
  keyedRoutesOf,
  reactNavigationStack,
  renewedStack,
  screenNameOf,
  screenNamesOf,
  steadyStack,
} from './stack.js'

// STACK

type ParamList = Record<string, Readonly<{ uri: string }>>

const Stack = createNativeStackNavigator<ParamList>()

const EntryScreen = ({
  route,
}: NativeStackScreenProps<ParamList, string>): ReactElement => (
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
  const look = useLook()
  const navigationRef = useMemo(
    () => createNavigationContainerRef<ParamList>(),
    [],
  )
  const [routesAtMount] = useState(initialRoutes)
  const [isReady, setIsReady] = useState(false)
  const screenNames = useMemo(
    () => screenNamesOf(bound.destinationTags()),
    [bound],
  )
  const nameOf = useMemo(
    () =>
      (key: string): string =>
        screenNameOf(bound.navigation(), key, bound.destinationTags()),
    [bound],
  )

  useEffect(() => {
    if (!isReady) {
      return undefined
    }
    return Navigation.runCarrier(
      bound,
      Navigation.keyedStackDriver(
        steadyStack(
          Navigation.coalescedStack(
            renewedStack(
              reactNavigationStack(navigationRef, routesAtMount, nameOf),
            ),
          ),
          bound.navigation,
          { isAddressShown: false },
        ),
      ),
      { launchUri: Option.fromNullishOr(launchUri) },
    )
  }, [bound, isReady, navigationRef, routesAtMount, launchUri, nameOf])

  return (
    <NavigationContainer
      ref={navigationRef}
      initialState={entryStateOf(routesAtMount, nameOf)}
      onReady={() => {
        setIsReady(true)
      }}
    >
      <Stack.Navigator
        screenOptions={({ route }) => ({
          ...entryOptionsOf(bound, route.key, look),
          headerRight: () => <HeaderMenuButton />,
        })}
      >
        {Array.map(screenNames, name => (
          <Stack.Screen key={name} name={name} component={EntryScreen} />
        ))}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

/**
 * The bound Program's navigation as a React Navigation native stack: one
 * screen named after each Destination the Program declares, and one
 * keyed route per plan entry under its Destination's screen, presented by
 * its declared style. A swipe,
 * the header back button, and the Android back button reach the Program
 * as `NavigatedBack`; every Program move resets the stack to its plan,
 * keeping unchanged screens mounted. Until the Program is Ready it shows
 * the Program's own description, `Starting Counter…`, and after that it
 * re-renders only if readiness changes; each screen repaints its own
 * entry. `launchUri` is a deep link the app
 * opened with.
 *
 * @example
 * ```tsx
 * <ProgramProvider bound={counter}>
 *   <FoldkitStack />
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
    onNone: () => <WhenReady>{null}</WhenReady>,
    onSome: initialRoutes => (
      <EntryStylesContext.Provider value={entryStylesOf(styles)}>
        <ReadyStack initialRoutes={initialRoutes} launchUri={launchUri} />
      </EntryStylesContext.Provider>
    ),
  })
}
