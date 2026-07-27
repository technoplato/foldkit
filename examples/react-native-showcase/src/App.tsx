import * as Calculator from 'calculator-core-example'
import {
  CalculatorClient,
  type CalculatorInitialRoute,
  initialCalculatorRoute,
} from 'calculator-react-bindings-example'
import * as Counter from 'counter-core-example'
import {
  CounterClient,
  type CounterInitialRoute,
  initialCounterRoute,
} from 'counter-react-bindings-example'
import * as Counters from 'counters-core-example'
import {
  MultipleCountersClient,
  type MultipleCountersInitialRoute,
  initialMultipleCountersRoute,
} from 'counters-react-bindings-example'
import { Effect, Exit, Match as M, Option } from 'effect'
import { StatusBar } from 'expo-status-bar'
import { FactProgram, detailForModel, displayForModel } from 'fact-core-example'
import { initialFactRoute } from 'fact-react-bindings-example'
import * as Program from 'foldkit/program'
import { fromString } from 'foldkit/url'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import {
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { DependencyLifecycle } from 'shared-react-bindings-example'
import * as Showcase from 'showcase-core-example'
import {
  type ShowcaseInitialRoute,
  ShowcaseProvider,
  initialShowcaseRoute,
  useShowcaseActions,
  useShowcaseModel,
  useShowcaseReplay,
} from 'showcase-react-bindings-example'

import {
  ClientPlatformDependency,
  FactClientDependency,
  ShowcaseFactClient,
} from './platform'
import { ReplayControls } from './replayControls'

const counterRouter = Program.makeRouter(Counter.CounterProgram)
const countersRouter = Program.makeRouter(Counters.MultipleCountersProgram)
const calculatorRouter = Program.makeRouter(Calculator.CalculatorProgram)
const factRouter = Program.makeRouter(FactProgram)
const showcaseRouter = Program.makeRouter(Showcase.ShowcaseProgram)

const dependencyLabel = <ImplementationName extends string>(
  lifecycle: DependencyLifecycle<ImplementationName>,
): string =>
  M.value(lifecycle).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Idle: () => 'Idle',
      Starting: ({ attempted }) => `${attempted} · Starting`,
      Ready: ({ current }) => `${current} · Ready`,
      Switching: ({ from, to }) => `${from} → ${to} · Switching`,
      Failed: ({ attempted, current }) => {
        if (Option.isSome(current)) {
          return `${current.value} · ${attempted} failed`
        }
        return `${attempted} · Failed`
      },
    }),
  )

const portablePath = (url: string): string => {
  const parsed = new URL(url)
  return `${parsed.pathname}${parsed.search}`
}

const resolveInlineRoute = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Error,
>(
  parse: Effect.Effect<Program.ProgramRoute<Model, Message>, Error>,
): Effect.Effect<
  Program.ResolvedProgramRoute<Model, Message>,
  Error | string
> =>
  Effect.flatMap(parse, route => {
    if (route._tag === 'SavedReplay') {
      return Effect.fail('Saved replay routes require a ReplayTapeStore')
    }
    return Effect.succeed(route)
  })

type ShowcaseInitialization = Readonly<{
  initialCarrierPath?: string
  initialRoute: ShowcaseInitialRoute
  revision: number
}>

const resolveShowcaseProgramRoute = (
  path: string,
): Promise<Option.Option<ShowcaseInitialRoute>> =>
  Effect.runPromiseExit(resolveInlineRoute(showcaseRouter.parse(path))).then(
    exit => {
      if (Exit.isSuccess(exit)) {
        return Option.some(exit.value)
      }
      return Option.none()
    },
  )

/** Runs the canonical examples through one Expo Web, iOS, and Android host. */
export const App = () => {
  const [initialization, setInitialization] = useState<ShowcaseInitialization>()

  const openShowcaseProgramRoute = useCallback(
    (path: string): Promise<boolean> =>
      resolveShowcaseProgramRoute(path).then(maybeRoute => {
        if (Option.isNone(maybeRoute)) {
          return false
        }
        setInitialization(current => ({
          initialRoute: maybeRoute.value,
          revision: (current?.revision ?? 0) + 1,
        }))
        return true
      }),
    [],
  )

  useEffect(() => {
    let isActive = true
    const initializePath = (path: string): void => {
      resolveShowcaseProgramRoute(path).then(maybeRoute => {
        if (!isActive) {
          return
        }
        if (Option.isSome(maybeRoute)) {
          setInitialization({ initialRoute: maybeRoute.value, revision: 0 })
        } else {
          setInitialization({
            initialCarrierPath: path,
            initialRoute: initialShowcaseRoute,
            revision: 0,
          })
        }
      })
    }

    if (Platform.OS === 'web') {
      initializePath(
        `${globalThis.location.pathname}${globalThis.location.search}`,
      )
    } else {
      Linking.getInitialURL().then(url => {
        initializePath(url === null ? '/showcase' : portablePath(url))
      })
    }
    return () => {
      isActive = false
    }
  }, [])

  if (initialization === undefined) {
    return <StartingShowcase />
  }
  return (
    <ShowcaseProvider
      key={initialization.revision}
      initialRoute={initialization.initialRoute}
      fallback={<StartingShowcase />}
    >
      <ShowcaseScreen
        initialCarrierPath={initialization.initialCarrierPath}
        openShowcaseProgramRoute={openShowcaseProgramRoute}
      />
    </ShowcaseProvider>
  )
}

const StartingShowcase = () => (
  <SafeAreaView style={styles.safeArea}>
    <View style={styles.startingShowcase}>
      <Text style={styles.detail}>Starting showcase navigation…</Text>
    </View>
  </SafeAreaView>
)

const ShowcaseScreen = ({
  initialCarrierPath,
  openShowcaseProgramRoute,
}: Readonly<{
  initialCarrierPath: string | undefined
  openShowcaseProgramRoute: (path: string) => Promise<boolean>
}>) => {
  const model = useShowcaseModel()
  const actions = useShowcaseActions()
  const replay = useShowcaseReplay()
  const [counterRoute, setCounterRoute] = useState(initialCounterRoute)
  const [countersRoute, setCountersRoute] = useState(
    initialMultipleCountersRoute,
  )
  const [calculatorRoute, setCalculatorRoute] = useState(initialCalculatorRoute)
  const [factRoute, setFactRoute] = useState(initialFactRoute)
  const [routeRevision, setRouteRevision] = useState(0)
  const [isCarrierReady, setCarrierReady] = useState(false)
  const hasOpenedInitialCarrier = useRef(false)
  const hasProjectedInitialNavigation = useRef(false)
  const isReconcilingCarrier = useRef(initialCarrierPath === undefined)

  useEffect(() => {
    let isActive = true
    const openPortablePath = async (
      path: string,
      isInitial = false,
    ): Promise<void> => {
      if (!isInitial && (await openShowcaseProgramRoute(path))) {
        return
      }
      const selectRoute = <Model, Message extends Readonly<{ _tag: string }>>(
        navigation: Showcase.Navigation,
        parse: Effect.Effect<
          Program.ResolvedProgramRoute<Model, Message>,
          unknown
        >,
        setRoute: (route: Program.ResolvedProgramRoute<Model, Message>) => void,
      ): Promise<void> =>
        Effect.runPromiseExit(parse).then(exit => {
          if (Exit.isSuccess(exit)) {
            isReconcilingCarrier.current = true
            setRoute(exit.value)
            actions.openedNavigation(navigation)
            setRouteRevision(revision => revision + 1)
          }
        })

      if (path === '/showcase' || path.startsWith('/showcase/')) {
        const maybeUrl = fromString(`https://showcase.invalid${path}`)
        if (Option.isSome(maybeUrl)) {
          const navigation = Showcase.urlToNavigation(maybeUrl.value)
          if (!isInitial || navigation._tag !== 'HomeScene') {
            isReconcilingCarrier.current = true
            actions.openedNavigation(navigation)
          }
        }
        return Promise.resolve()
      }

      if (path.startsWith('/counter/')) {
        return selectRoute(
          Showcase.CounterScene.make({}),
          resolveInlineRoute(counterRouter.parse(path)),
          setCounterRoute,
        )
      } else if (path.startsWith('/multiple-counters/')) {
        return selectRoute(
          Showcase.MultipleCountersScene.make({}),
          resolveInlineRoute(countersRouter.parse(path)),
          setCountersRoute,
        )
      } else if (path.startsWith('/calculator/')) {
        return selectRoute(
          Showcase.CalculatorScene.make({}),
          resolveInlineRoute(calculatorRouter.parse(path)),
          setCalculatorRoute,
        )
      } else if (path.startsWith('/fact/')) {
        return selectRoute(
          Showcase.FactScene.make({}),
          resolveInlineRoute(factRouter.parse(path)),
          setFactRoute,
        )
      }
      return Promise.resolve()
    }

    const openUrl = (url: string, isInitial = false): Promise<void> =>
      openPortablePath(portablePath(url), isInitial)

    const openedCarrierPath = (): void => {
      openPortablePath(
        `${globalThis.location.pathname}${globalThis.location.search}`,
      )
    }

    let initialCarrier = Promise.resolve()
    if (!hasOpenedInitialCarrier.current) {
      hasOpenedInitialCarrier.current = true
      if (initialCarrierPath !== undefined) {
        initialCarrier = openPortablePath(initialCarrierPath, true)
      }
    }

    initialCarrier.finally(() => {
      if (isActive) {
        setCarrierReady(true)
      }
    })

    const subscription = Linking.addEventListener('url', ({ url }) => {
      openUrl(url)
    })
    if (Platform.OS === 'web') {
      globalThis.addEventListener('popstate', openedCarrierPath)
    }
    return () => {
      isActive = false
      subscription.remove()
      if (Platform.OS === 'web') {
        globalThis.removeEventListener('popstate', openedCarrierPath)
      }
    }
  }, [actions, initialCarrierPath, openShowcaseProgramRoute])

  useEffect(() => {
    if (Platform.OS !== 'web' || !isCarrierReady) {
      return
    }
    if (isReconcilingCarrier.current) {
      isReconcilingCarrier.current = false
      hasProjectedInitialNavigation.current = true
      return
    }

    const nextPath = Showcase.navigationToPath(model.navigation)
    if (globalThis.location.pathname !== nextPath) {
      if (
        !hasProjectedInitialNavigation.current ||
        replay.mode === 'Inspecting'
      ) {
        globalThis.history.replaceState({}, '', nextPath)
      } else {
        globalThis.history.pushState({}, '', nextPath)
      }
    }
    hasProjectedInitialNavigation.current = true
  }, [isCarrierReady, model.navigation, replay.mode])

  const content = M.value(model.navigation).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      HomeScene: () => <ShowcaseHome />,
      CounterScene: () => (
        <CounterExample key={routeRevision} route={counterRoute} />
      ),
      MultipleCountersScene: () => (
        <CountersExample key={routeRevision} route={countersRoute} />
      ),
      CalculatorScene: () => (
        <CalculatorExample key={routeRevision} route={calculatorRoute} />
      ),
      FactScene: () => <FactExample key={routeRevision} route={factRoute} />,
    }),
  )

  const isHome = model.navigation._tag === 'HomeScene'

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.shell}>
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            {isHome ? null : (
              <Pressable
                accessibilityLabel="Back to showcase"
                accessibilityRole="button"
                onPress={actions.tappedBackButton}
                style={styles.backButton}
              >
                <Text style={styles.backButtonText}>‹</Text>
              </Pressable>
            )}
            <View>
              <Text style={styles.eyebrow}>Foldkit</Text>
              <Text style={styles.title}>Universal Program Showcase</Text>
            </View>
          </View>
          <Text style={styles.platform}>{Platform.OS}</Text>
        </View>
        {isHome ? null : <ShowcaseTabs navigation={model.navigation} />}
        <ScrollView contentContainerStyle={styles.content}>
          {content}
          <View style={styles.navigationReplay}>
            <ReplayControls label="Navigation replay" replay={replay} />
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  )
}

const ShowcaseHome = () => {
  const actions = useShowcaseActions()
  return (
    <View style={styles.home}>
      <View style={styles.homeIntroduction}>
        <Text style={styles.homeTitle}>Choose a shared Program</Text>
        <Text style={styles.homeBody}>
          Each tap enters the showcase update loop as a Message. The resulting
          scene can be replayed and opened through the same portable path on
          web, iOS, and Android.
        </Text>
      </View>
      <ShowcaseCard
        description="One shared Model and three domain actions."
        onPress={actions.tappedCounterButton}
        title="Counter"
      />
      <ShowcaseCard
        description="Navigation, presentation, and identified child Programs."
        onPress={actions.tappedMultipleCountersButton}
        title="Multiple Counters"
      />
      <ShowcaseCard
        description="A lazy expression Model with replayable button facts."
        onPress={actions.tappedCalculatorButton}
        title="Calculator"
      />
      <ShowcaseCard
        description="Commands and switchable Effect dependency Layers."
        onPress={actions.tappedFactButton}
        title="Fact"
      />
    </View>
  )
}

const ShowcaseCard = ({
  description,
  onPress,
  title,
}: Readonly<{
  description: string
  onPress: () => void
  title: string
}>) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    style={styles.showcaseCard}
  >
    <View style={styles.showcaseCardCopy}>
      <Text style={styles.showcaseCardTitle}>{title}</Text>
      <Text style={styles.showcaseCardDescription}>{description}</Text>
    </View>
    <Text style={styles.showcaseCardArrow}>›</Text>
  </Pressable>
)

const ShowcaseTabs = ({
  navigation,
}: Readonly<{ navigation: Showcase.Navigation }>) => {
  const actions = useShowcaseActions()
  return (
    <View style={styles.tabs}>
      <SceneTab
        isSelected={navigation._tag === 'CounterScene'}
        label="Counter"
        onPress={actions.tappedCounterButton}
      />
      <SceneTab
        isSelected={navigation._tag === 'MultipleCountersScene'}
        label="Counters"
        onPress={actions.tappedMultipleCountersButton}
      />
      <SceneTab
        isSelected={navigation._tag === 'CalculatorScene'}
        label="Calculator"
        onPress={actions.tappedCalculatorButton}
      />
      <SceneTab
        isSelected={navigation._tag === 'FactScene'}
        label="Fact"
        onPress={actions.tappedFactButton}
      />
    </View>
  )
}

const SceneTab = ({
  isSelected,
  label,
  onPress,
}: Readonly<{
  isSelected: boolean
  label: string
  onPress: () => void
}>) => (
  <Pressable
    accessibilityRole="button"
    disabled={isSelected}
    onPress={onPress}
    style={isSelected ? styles.activeTab : styles.tab}
  >
    <Text style={isSelected ? styles.activeTabText : styles.tabText}>
      {label}
    </Text>
  </Pressable>
)

const CounterExample = ({
  route,
}: Readonly<{ route: CounterInitialRoute }>) => (
  <CounterClient.Provider initialRoute={route}>
    <CounterScreen />
  </CounterClient.Provider>
)

const CounterScreen = () => {
  const model = CounterClient.useModel()
  const actions = CounterClient.useActions()
  const replay = CounterClient.useReplay()
  return (
    <View style={styles.example}>
      <Text style={styles.display}>{model.count}</Text>
      <View style={styles.buttonRow}>
        <ActionButton label="−" onPress={actions.clickedDecrement} />
        <ActionButton label="Reset" onPress={actions.clickedReset} />
        <ActionButton label="+" onPress={actions.clickedIncrement} />
      </View>
      <ReplayControls replay={replay} />
    </View>
  )
}

const CountersExample = ({
  route,
}: Readonly<{ route: MultipleCountersInitialRoute }>) => (
  <MultipleCountersClient.Provider initialRoute={route}>
    <CountersScreen />
  </MultipleCountersClient.Provider>
)

const CountersScreen = () => {
  const model = MultipleCountersClient.useModel()
  const actions = MultipleCountersClient.useActions()
  const replay = MultipleCountersClient.useReplay()
  return (
    <View style={styles.example}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Multiple counters</Text>
        <ActionButton label="Add" onPress={actions.clickedAddCounter} primary />
      </View>
      {model.rows.map(row => (
        <View key={row.id} style={styles.counterCard}>
          <View>
            <Text style={styles.counterId}>{row.id}</Text>
            <Text style={styles.counterValue}>{row.counter.count}</Text>
          </View>
          <View style={styles.buttonRow}>
            <ActionButton
              label="−"
              onPress={() => actions.clickedDecrementCounter(row.id)}
            />
            <ActionButton
              label="+"
              onPress={() => actions.clickedIncrementCounter(row.id)}
            />
          </View>
        </View>
      ))}
      <ReplayControls replay={replay} />
    </View>
  )
}

const CalculatorExample = ({
  route,
}: Readonly<{ route: CalculatorInitialRoute }>) => (
  <CalculatorClient.Provider initialRoute={route}>
    <CalculatorScreen />
  </CalculatorClient.Provider>
)

const CalculatorScreen = () => {
  const model = CalculatorClient.useModel()
  const actions = CalculatorClient.useActions()
  const replay = CalculatorClient.useReplay()
  const buttons: ReadonlyArray<
    Readonly<{ label: string; onPress: () => void; isOperation?: boolean }>
  > = [
    { label: '⌫', onPress: actions.pressedBackspace },
    { label: 'AC', onPress: actions.pressedClear },
    { label: '%', onPress: actions.pressedPercent },
    {
      label: '÷',
      onPress: () => actions.pressedOperation('Divide'),
      isOperation: true,
    },
    { label: '7', onPress: () => actions.pressedDigit('Seven') },
    { label: '8', onPress: () => actions.pressedDigit('Eight') },
    { label: '9', onPress: () => actions.pressedDigit('Nine') },
    {
      label: '×',
      onPress: () => actions.pressedOperation('Multiply'),
      isOperation: true,
    },
    { label: '4', onPress: () => actions.pressedDigit('Four') },
    { label: '5', onPress: () => actions.pressedDigit('Five') },
    { label: '6', onPress: () => actions.pressedDigit('Six') },
    {
      label: '−',
      onPress: () => actions.pressedOperation('Subtract'),
      isOperation: true,
    },
    { label: '1', onPress: () => actions.pressedDigit('One') },
    { label: '2', onPress: () => actions.pressedDigit('Two') },
    { label: '3', onPress: () => actions.pressedDigit('Three') },
    {
      label: '+',
      onPress: () => actions.pressedOperation('Add'),
      isOperation: true,
    },
    { label: '+/−', onPress: actions.pressedSign },
    { label: '0', onPress: () => actions.pressedDigit('Zero') },
    { label: '.', onPress: actions.pressedDecimalSeparator },
    { label: '=', onPress: actions.pressedEquals, isOperation: true },
  ]

  return (
    <View style={styles.example}>
      <View style={styles.calculatorDisplay}>
        <Text style={styles.expression}>
          {Calculator.expressionForModel(model)}
        </Text>
        <Text style={styles.calculatorValue}>
          {Calculator.displayForModel(model)}
        </Text>
      </View>
      <View style={styles.calculatorGrid}>
        {buttons.map(button => (
          <Pressable
            accessibilityRole="button"
            key={button.label}
            onPress={button.onPress}
            style={
              button.isOperation === true
                ? styles.operationButton
                : styles.calculatorButton
            }
          >
            <Text style={styles.calculatorButtonText}>{button.label}</Text>
          </Pressable>
        ))}
      </View>
      <ReplayControls replay={replay} />
    </View>
  )
}

const FactExample = ({
  route,
}: Readonly<{ route: typeof initialFactRoute }>) => (
  <ShowcaseFactClient.Provider initialRoute={route}>
    <FactScreen />
  </ShowcaseFactClient.Provider>
)

const FactScreen = () => {
  const model = ShowcaseFactClient.useFactModel()
  const actions = ShowcaseFactClient.useFactActions()
  const replay = ShowcaseFactClient.useFactReplay()
  const factClient = ShowcaseFactClient.useDependency({
    dependencyKey: FactClientDependency,
  })
  const platform = ShowcaseFactClient.useDependency({
    dependencyKey: ClientPlatformDependency,
  })

  return (
    <View style={styles.example}>
      <View style={styles.factCard}>
        <Text style={styles.fact}>{displayForModel(model)}</Text>
        <Text style={styles.detail}>{detailForModel(model)}</Text>
      </View>
      <Text style={styles.sectionLabel}>
        FactClient Layer · {dependencyLabel(factClient.current)}
      </Text>
      <View style={styles.buttonRow}>
        <ActionButton
          label="Mock"
          onPress={() => factClient.switchTo('Mock')}
        />
        <ActionButton
          label="Live"
          onPress={() => factClient.switchTo('Live')}
        />
        <ActionButton
          label="Load fact"
          onPress={actions.clickedLoadFact}
          primary
        />
      </View>
      <Text style={styles.sectionLabel}>
        Platform Layer · {dependencyLabel(platform.current)}
      </Text>
      <View style={styles.buttonRow}>
        <ActionButton label="Web" onPress={() => platform.switchTo('Web')} />
        <ActionButton label="iOS" onPress={() => platform.switchTo('iOS')} />
        <ActionButton
          label="Android"
          onPress={() => platform.switchTo('Android')}
        />
      </View>
      <ReplayControls replay={replay} />
    </View>
  )
}

const ActionButton = ({
  label,
  onPress,
  primary = false,
}: Readonly<{ label: string; onPress: () => void; primary?: boolean }>) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    style={primary ? styles.primaryButton : styles.actionButton}
  >
    <Text style={primary ? styles.primaryButtonText : styles.actionButtonText}>
      {label}
    </Text>
  </Pressable>
)

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#09090b', flex: 1 },
  shell: { flex: 1 },
  startingShowcase: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 20,
  },
  headerTitle: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    minWidth: 0,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#27272a',
    borderRadius: 99,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  backButtonText: {
    color: '#fafafa',
    fontSize: 32,
    fontWeight: '300',
    lineHeight: 34,
  },
  eyebrow: {
    color: '#a3e635',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#fafafa',
    flexShrink: 1,
    fontSize: 21,
    fontWeight: '700',
    marginTop: 4,
  },
  platform: {
    backgroundColor: '#27272a',
    borderRadius: 99,
    color: '#d4d4d8',
    flexShrink: 0,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  tab: {
    backgroundColor: '#18181b',
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  activeTab: {
    backgroundColor: '#a3e635',
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tabText: { color: '#a1a1aa', fontSize: 13, fontWeight: '700' },
  activeTabText: { color: '#1a2e05', fontSize: 13, fontWeight: '800' },
  content: { gap: 20, padding: 20, paddingBottom: 60 },
  home: { gap: 12 },
  homeIntroduction: { gap: 8, marginBottom: 8 },
  homeTitle: { color: '#fafafa', fontSize: 34, fontWeight: '700' },
  homeBody: { color: '#a1a1aa', fontSize: 15, lineHeight: 23 },
  showcaseCard: {
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderColor: '#3f3f46',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    padding: 20,
  },
  showcaseCardCopy: { flex: 1, gap: 6 },
  showcaseCardTitle: { color: '#fafafa', fontSize: 20, fontWeight: '700' },
  showcaseCardDescription: { color: '#a1a1aa', fontSize: 14, lineHeight: 20 },
  showcaseCardArrow: { color: '#a3e635', fontSize: 32, fontWeight: '300' },
  navigationReplay: { marginTop: 8 },
  example: { gap: 20 },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: '#fafafa', fontSize: 24, fontWeight: '700' },
  counterCard: {
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderColor: '#3f3f46',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 18,
  },
  counterId: { color: '#a1a1aa', fontSize: 12 },
  counterValue: {
    color: '#fafafa',
    fontSize: 38,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    marginTop: 4,
  },
  display: {
    color: '#fafafa',
    fontSize: 96,
    fontWeight: '300',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionButton: {
    backgroundColor: '#27272a',
    borderRadius: 12,
    minWidth: 76,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  actionButtonText: {
    color: '#fafafa',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#a3e635',
    borderRadius: 12,
    minWidth: 96,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#1a2e05',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  calculatorDisplay: {
    alignItems: 'flex-end',
    minHeight: 150,
    justifyContent: 'flex-end',
  },
  expression: { color: '#71717a', fontSize: 24, marginBottom: 8 },
  calculatorValue: { color: '#fafafa', fontSize: 64, fontWeight: '300' },
  calculatorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  calculatorButton: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#27272a',
    borderRadius: 999,
    justifyContent: 'center',
    width: '22%',
  },
  operationButton: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#f59e0b',
    borderRadius: 999,
    justifyContent: 'center',
    width: '22%',
  },
  calculatorButtonText: { color: '#fafafa', fontSize: 28, fontWeight: '500' },
  factCard: {
    backgroundColor: '#fafafa',
    borderRadius: 18,
    minHeight: 190,
    padding: 22,
  },
  fact: { color: '#18181b', fontSize: 24, fontWeight: '700' },
  detail: { color: '#71717a', fontSize: 13, marginTop: 12 },
  sectionLabel: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
})
