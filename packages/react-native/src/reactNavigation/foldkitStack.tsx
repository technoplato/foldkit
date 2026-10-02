import { Array, Match as M, Option } from 'effect'
import { Navigation } from 'foldkit'
import {
  type ReactElement,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { type AnyBound, useBound } from '@foldkit/react/interaction'
import { useNavigationPlan, useViewAt } from '@foldkit/react/navigation'
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native'
import {
  type NativeStackScreenProps,
  createNativeStackNavigator,
} from '@react-navigation/native-stack'

import { ActionMenuSheet } from '../interaction/actionMenuModal.js'
import { type PaintStyles, paintTree } from '../interaction/screen.js'
import {
  entryRouteName,
  entryStateOf,
  keyedRoutesOf,
  presentationOf,
  reactNavigationStack,
} from './stack.js'

// STACK

type ParamList = {
  [entryRouteName]: Readonly<{ uri: string }>
}

const Stack = createNativeStackNavigator<ParamList>()

const entryAt = (
  bound: AnyBound,
  key: string,
): Option.Option<Navigation.CarrierEntry<unknown>> =>
  Option.flatMap(bound.navigation(), plan =>
    Array.findFirst(plan.entries, entry => entry.key === key),
  )

const noStyles: PaintStyles = {}

const StylesContext = createContext<PaintStyles>(noStyles)

const EntryScreen = ({
  route,
}: NativeStackScreenProps<
  ParamList,
  typeof entryRouteName
>): ReactElement | null => {
  const bound = useBound()
  const styles = useContext(StylesContext)
  const maybeView = useViewAt(route.key)
  return useMemo(
    () =>
      Option.match(maybeView, {
        onNone: () => null,
        onSome: view =>
          M.value(view).pipe(
            M.withReturnType<ReactElement>(),
            M.tagsExhaustive({
              Screen: ({ node }) =>
                paintTree(node, {
                  styles,
                  onPress: button => {
                    if (button.action !== undefined) {
                      bound.press(button.action)
                    }
                  },
                }),
              Menu: ({ menu }) => <ActionMenuSheet menu={menu} />,
            }),
          ),
      }),
    [bound, maybeView, styles],
  )
}

const ReadyStack = ({
  initialPlan,
  launchUri,
}: Readonly<{
  initialPlan: Navigation.CarrierPlan<unknown>
  launchUri: string | undefined
}>): ReactElement => {
  const bound = useBound()
  const navigationRef = useMemo(
    () => createNavigationContainerRef<ParamList>(),
    [],
  )
  const [initialRoutes] = useState(() => keyedRoutesOf(initialPlan))
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!isReady) {
      return undefined
    }
    return Navigation.runCarrier(
      bound,
      Navigation.keyedStackDriver(
        reactNavigationStack(navigationRef, initialRoutes),
      ),
      { launchUri: Option.fromNullishOr(launchUri) },
    )
  }, [bound, isReady, navigationRef, initialRoutes, launchUri])

  return (
    <NavigationContainer
      ref={navigationRef}
      initialState={entryStateOf(initialRoutes)}
      onReady={() => {
        setIsReady(true)
      }}
    >
      <Stack.Navigator
        screenOptions={({ route }) => {
          const maybeEntry = entryAt(bound, route.key)
          const presentation = presentationOf(
            Option.flatMap(maybeEntry, entry => entry.maybeStyle),
          )
          return {
            presentation,
            headerShown: presentation === 'card',
            title: Option.match(maybeEntry, {
              onNone: () => '',
              onSome: entry => entry.title,
            }),
          }
        }}
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
 * is Ready. `launchUri` is a deep link the app opened with.
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
}>): ReactElement | null =>
  Option.match(useNavigationPlan(), {
    onNone: () => null,
    onSome: plan => (
      <StylesContext.Provider value={styles ?? noStyles}>
        <ReadyStack initialPlan={plan} launchUri={launchUri} />
      </StylesContext.Provider>
    ),
  })
