import * as Calculator from 'calculator-core-example'
import {
  CalculatorClient,
  type CalculatorInitialRoute,
  initialCalculatorRoute,
} from 'calculator-react-bindings-example'
import * as Cardboard from 'cardboard-core-example'
import {
  CardboardClient,
  type CardboardInitialRoute,
} from 'cardboard-react-bindings-example'
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
import { Array, Effect, Exit, Match as M, Option } from 'effect'
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
  type ViewStyle,
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
  type WalletInitialRoute,
  initialWalletRoute,
} from 'wallet-react-bindings-example'

import { NativeNavigationComparison } from './nativeNavigationComparison'
import {
  ClientPlatformDependency,
  FactClientDependency,
  ShowcaseFactClient,
} from './platform'
import { ReplayControls } from './replayControls'
import { WalletExample, WalletProgram } from './wallet'

const counterRouter = Program.makeRouter(Counter.CounterProgram)
const countersRouter = Program.makeRouter(Counters.MultipleCountersProgram)
const calculatorRouter = Program.makeRouter(Calculator.CalculatorProgram)
const cardboardRouter = Cardboard.CardboardRouter
const factRouter = Program.makeRouter(FactProgram)
const showcaseRouter = Program.makeRouter(Showcase.ShowcaseProgram)
const walletRouter = Program.makeRouter(WalletProgram)

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
  if (parsed.pathname === '/--') {
    return `/${parsed.search}`
  }
  if (parsed.pathname.startsWith('/--/')) {
    return `${parsed.pathname.slice(3)}${parsed.search}`
  }
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
  const [cardboardRoute, setCardboardRoute] = useState<CardboardInitialRoute>(
    Cardboard.initialCardboardRoute,
  )
  const [factRoute, setFactRoute] = useState(initialFactRoute)
  const [walletRoute, setWalletRoute] =
    useState<WalletInitialRoute>(initialWalletRoute)
  const [routeRevision, setRouteRevision] = useState(0)
  const [isCarrierReady, setCarrierReady] = useState(false)
  const hasOpenedInitialCarrier = useRef(false)
  const hasProjectedInitialNavigation = useRef(false)
  const isReconcilingCarrier = useRef(initialCarrierPath === undefined)
  const lastSceneContent = useRef<ReactNode | undefined>(undefined)
  const lastSceneNavigation = useRef<Showcase.Navigation | undefined>(undefined)

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

      if (path === '/counters' || path.startsWith('/counters/')) {
        const maybeUrl = fromString(`https://showcase.invalid${path}`)
        if (
          Option.isSome(maybeUrl) &&
          (isInitial || model.navigation._tag !== 'MultipleCountersScene')
        ) {
          const navigation = Counters.urlToNavigation(maybeUrl.value)
          isReconcilingCarrier.current = true
          setCountersRoute(
            Program.state(Counters.modelForNavigation(navigation)),
          )
          actions.openedNavigation(Showcase.MultipleCountersScene.make({}))
          setRouteRevision(revision => revision + 1)
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
      } else if (path === '/0' || path.startsWith('/0/')) {
        return selectRoute(
          Showcase.CardboardScene.make({}),
          resolveInlineRoute(cardboardRouter.parse(path)),
          setCardboardRoute,
        )
      } else if (path.startsWith('/fact/')) {
        return selectRoute(
          Showcase.FactScene.make({}),
          resolveInlineRoute(factRouter.parse(path)),
          setFactRoute,
        )
      } else if (path.startsWith('/wallet/')) {
        return selectRoute(
          Showcase.WalletScene.make({}),
          resolveInlineRoute(walletRouter.parse(path)),
          setWalletRoute,
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
  }, [
    actions,
    initialCarrierPath,
    model.navigation._tag,
    openShowcaseProgramRoute,
  ])

  useEffect(() => {
    if (Platform.OS !== 'web' || !isCarrierReady) {
      return
    }
    if (model.navigation._tag === 'MultipleCountersScene') {
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
      CardboardScene: () => (
        <CardboardExample key={routeRevision} route={cardboardRoute} />
      ),
      FactScene: () => <FactExample key={routeRevision} route={factRoute} />,
      WalletScene: () => (
        <WalletExample key={routeRevision} route={walletRoute} />
      ),
    }),
  )

  const isHome = model.navigation._tag === 'HomeScene'

  if (!isHome) {
    lastSceneContent.current = content
    lastSceneNavigation.current = model.navigation
  }

  if (Platform.OS !== 'web') {
    const preservedSceneContent = lastSceneContent.current
    const preservedSceneNavigation = lastSceneNavigation.current
    const scene =
      preservedSceneContent === undefined ||
      preservedSceneNavigation === undefined ? (
        <StartingShowcase />
      ) : (
        <NativeShowcaseScreen
          content={preservedSceneContent}
          maybeNavigation={Option.some(preservedSceneNavigation)}
          replay={replay}
        />
      )

    return (
      <NativeNavigationComparison
        home={
          <NativeShowcaseScreen
            content={<ShowcaseHome />}
            maybeNavigation={Option.none()}
            replay={replay}
          />
        }
        isProgramHome={isHome}
        onAcceptedBack={actions.tappedBackButton}
        scene={scene}
      />
    )
  }

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
            <ReplayControls label="Showcase replay" replay={replay} />
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  )
}

const NativeShowcaseScreen = ({
  content,
  maybeNavigation,
  replay,
}: Readonly<{
  content: ReactNode
  maybeNavigation: Option.Option<Showcase.Navigation>
  replay: ReturnType<typeof useShowcaseReplay>
}>) => (
  <SafeAreaView style={styles.safeArea}>
    <StatusBar style="light" />
    <View style={styles.shell}>
      {Option.isSome(maybeNavigation) ? (
        <ShowcaseTabs navigation={maybeNavigation.value} />
      ) : null}
      <ScrollView contentContainerStyle={styles.content}>
        {content}
        <View style={styles.navigationReplay}>
          <ReplayControls label="Showcase replay" replay={replay} />
        </View>
      </ScrollView>
    </View>
  </SafeAreaView>
)

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
        description="Rule Zero, typed state transitions, portable /0 routes, and accessible presentation."
        onPress={actions.tappedCardboardButton}
        title="Project Cardboard"
      />
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
      <ShowcaseCard
        description="Public accounts, simulated signing, subscriptions, and replay."
        onPress={actions.tappedWalletButton}
        title="Wallet"
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
        isSelected={navigation._tag === 'CardboardScene'}
        label="Cardboard"
        onPress={actions.tappedCardboardButton}
      />
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
      <SceneTab
        isSelected={navigation._tag === 'WalletScene'}
        label="Wallet"
        onPress={actions.tappedWalletButton}
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

const cardboardProfileStyle = (
  profile: Cardboard.AccessibilityProfile,
): ViewStyle =>
  M.value(profile).pipe(
    M.withReturnType<ViewStyle>(),
    M.when('AmberPaper', () => ({ backgroundColor: '#23180d' })),
    M.when('QuietBlack', () => ({ backgroundColor: '#020202' })),
    M.when('Groovebox', () => ({ backgroundColor: '#321a0a' })),
    M.when('GrooveboxThroughInvert', () => ({ backgroundColor: '#dce9f3' })),
    M.when('Negative', () => ({ backgroundColor: '#f2f2f2' })),
    M.when('HighContrast', () => ({ backgroundColor: '#000000' })),
    M.exhaustive,
  )

const cardboardInputMethodStyle = (
  inputMethod: Cardboard.InputMethod,
): ViewStyle =>
  M.value(inputMethod).pipe(
    M.withReturnType<ViewStyle>(),
    M.when('SegaGenesisController', () => ({ backgroundColor: '#171717' })),
    M.when('Nintendo64Controller', () => ({ backgroundColor: '#aaa59a' })),
    M.when('GameBoyColor', () => ({ backgroundColor: '#a868b1' })),
    M.when('Xbox360Controller', () => ({ backgroundColor: '#e8ebe6' })),
    M.when('MouseAndKeyboard', () => ({ backgroundColor: '#26313b' })),
    M.when('Joystick', () => ({ backgroundColor: '#502123' })),
    M.when('Eyes', () => ({ backgroundColor: '#223042' })),
    M.when('HeadLookingUp', () => ({ backgroundColor: '#37274a' })),
    M.when('HeadLookingDown', () => ({ backgroundColor: '#37274a' })),
    M.when('HeadLookingRight', () => ({ backgroundColor: '#37274a' })),
    M.when('Mirror', () => ({ backgroundColor: '#b9d8e8' })),
    M.exhaustive,
  )

const cardboardProfileForModel = (
  model: Cardboard.Model,
): Cardboard.AccessibilityProfile =>
  M.value(model.zero).pipe(
    M.withReturnType<Cardboard.AccessibilityProfile>(),
    M.tagsExhaustive({
      WaitingAtZero: () => Cardboard.initialAccessibilityProfile,
      PressingZero: () => Cardboard.initialAccessibilityProfile,
      OpeningZero: () => Cardboard.initialAccessibilityProfile,
      ConfiguringAtZero: ({ profile }) => profile,
      ChoosingInputMethod: ({ profile }) => profile,
      RejectedInputMethodChoice: ({ profile }) => profile,
      CompletedAtZero: ({ profile }) => profile,
    }),
  )

const CardboardExample = ({
  route,
}: Readonly<{ route: CardboardInitialRoute }>) => (
  <CardboardClient.Provider initialRoute={route}>
    <CardboardScreen />
  </CardboardClient.Provider>
)

const CardboardScreen = () => {
  const model = CardboardClient.useModel()
  const actions = CardboardClient.useActions()
  const replay = CardboardClient.useReplay()
  const isConfigurationVisible = model.zero._tag === 'ConfiguringAtZero'
  const isRiddleVisible =
    model.zero._tag === 'ChoosingInputMethod' ||
    model.zero._tag === 'RejectedInputMethodChoice'
  const profile = cardboardProfileForModel(model)
  const isPressed = model.zero._tag === 'PressingZero'
  const progress =
    model.zero._tag === 'OpeningZero'
      ? Math.round(model.zero.progressPermille / 10)
      : 0

  return (
    <View style={[styles.cardboardExample, cardboardProfileStyle(profile)]}>
      <View style={styles.cardboardHeading}>
        <View>
          <Text style={styles.cardboardEyebrow}>Project Cardboard</Text>
          <Text style={styles.cardboardTitle}>Rule Zero</Text>
        </View>
        <Text style={styles.cardboardRoute}>/0</Text>
      </View>
      <Pressable
        accessibilityHint="Hold until the accessibility presentation opens"
        accessibilityLabel="Rule Zero black button"
        accessibilityRole="button"
        onPressIn={actions.pressedZeroButton}
        onPressOut={actions.releasedZeroButton}
        style={[
          styles.cardboardZeroButton,
          isPressed ? styles.cardboardZeroButtonPressed : undefined,
        ]}
      >
        <Text style={styles.cardboardZeroLabel}>0</Text>
        <Text style={styles.cardboardProgress}>{progress}%</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={styles.cardboardReadout}>
        {Cardboard.accessibleDescription(model)}
      </Text>
      {isConfigurationVisible ? (
        <View style={styles.cardboardConfiguration}>
          <Text style={styles.cardboardProfile}>
            {Cardboard.accessibilityProfileLabel(profile)}
          </Text>
          <View style={styles.buttonRow}>
            <ActionButton
              label="Previous"
              onPress={() =>
                actions.selectedAccessibilityProfile(
                  Cardboard.previousAccessibilityProfile(profile),
                )
              }
            />
            <ActionButton
              label="RGB negative"
              onPress={actions.toggledRgbInversion}
            />
            <ActionButton
              label="Next"
              onPress={() =>
                actions.selectedAccessibilityProfile(
                  Cardboard.nextAccessibilityProfile(profile),
                )
              }
            />
            <ActionButton
              label="Continue"
              onPress={actions.completedZeroGame}
              primary
            />
          </View>
        </View>
      ) : null}
      {isRiddleVisible ? (
        <View style={styles.cardboardRiddle}>
          <Text style={styles.cardboardRiddleTitle}>
            If you are looking at yourself, where are you looking?
          </Text>
          <View style={styles.cardboardChoices}>
            {Array.map(Cardboard.inputMethods, inputMethod => (
              <Pressable
                accessibilityLabel={Cardboard.inputMethodLabel(inputMethod)}
                accessibilityRole="button"
                key={inputMethod}
                onPress={() => actions.selectedInputMethod(inputMethod)}
                style={[
                  styles.cardboardChoice,
                  cardboardInputMethodStyle(inputMethod),
                ]}
              >
                <Text style={styles.cardboardChoiceGlyph}>
                  {Cardboard.inputMethodGlyph(inputMethod)}
                </Text>
                <Text style={styles.cardboardChoiceLabel}>
                  {Cardboard.inputMethodLabel(inputMethod)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {!isConfigurationVisible &&
      !isRiddleVisible &&
      model.zero._tag !== 'CompletedAtZero' ? (
        <ActionButton
          label="Open without holding"
          onPress={actions.skippedZeroStep}
        />
      ) : null}
      <ReplayControls label="Cardboard replay" replay={replay} />
    </View>
  )
}

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
      <ReplayControls label="Counter replay" replay={replay} />
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
  const replay = MultipleCountersClient.useReplay()
  useCountersNavigationCarrier(model.navigation, replay.mode)
  const destination = Counters.destinationForModel(model)
  return (
    <View style={styles.example}>
      {M.value(destination).pipe(
        M.withReturnType<ReactNode>(),
        M.tagsExhaustive({
          CounterListDestination: ({ counters }) => (
            <CountersList counters={counters} />
          ),
          CounterDetailDestination: ({ counter, maybeMode }) => (
            <CounterDetail counter={counter} maybeMode={maybeMode} />
          ),
        }),
      )}
      <ReplayControls label="Multiple Counters replay" replay={replay} />
    </View>
  )
}

const useCountersNavigationCarrier = (
  navigation: Counters.Navigation,
  replayMode: 'Inspecting' | 'Live',
): void => {
  const actions = MultipleCountersClient.useActions()
  const isReconcilingCarrier = useRef(
    Platform.OS === 'web' &&
      globalThis.location.pathname === '/showcase/counters',
  )
  const isOpeningProgramRoute = useRef(
    Platform.OS === 'web' &&
      globalThis.location.pathname.startsWith('/multiple-counters/'),
  )

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return
    }
    if (isOpeningProgramRoute.current) {
      isOpeningProgramRoute.current = false
      return
    }

    const nextPath = Counters.navigationToPath(navigation)
    if (globalThis.location.pathname !== nextPath) {
      if (isReconcilingCarrier.current || replayMode === 'Inspecting') {
        globalThis.history.replaceState({}, '', nextPath)
      } else {
        globalThis.history.pushState({}, '', nextPath)
      }
    }
    isReconcilingCarrier.current = false
  }, [navigation, replayMode])

  useEffect(() => {
    const openPortablePath = (path: string): void => {
      if (path !== '/counters' && !path.startsWith('/counters/')) {
        return
      }
      const maybeUrl = fromString(`https://showcase.invalid${path}`)
      if (Option.isSome(maybeUrl)) {
        const nextNavigation = Counters.urlToNavigation(maybeUrl.value)
        if (
          Counters.navigationToPath(nextNavigation) !==
          Counters.navigationToPath(navigation)
        ) {
          isReconcilingCarrier.current = true
          actions.openedNavigation(nextNavigation)
        }
      }
    }
    const openUrl = ({ url }: Readonly<{ url: string }>): void => {
      openPortablePath(portablePath(url))
    }
    const openBrowserPath = (): void => {
      openPortablePath(
        `${globalThis.location.pathname}${globalThis.location.search}`,
      )
    }

    const subscription = Linking.addEventListener('url', openUrl)
    if (Platform.OS === 'web') {
      globalThis.addEventListener('popstate', openBrowserPath)
    }
    return () => {
      subscription.remove()
      if (Platform.OS === 'web') {
        globalThis.removeEventListener('popstate', openBrowserPath)
      }
    }
  }, [actions, navigation])
}

const CountersList = ({
  counters,
}: Readonly<{ counters: ReadonlyArray<Counters.CounterRow> }>) => {
  const actions = MultipleCountersClient.useActions()
  return (
    <View style={styles.example}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeadingCopy}>
          <Text style={styles.sectionTitle}>Multiple counters</Text>
          <Text style={styles.sectionDescription}>
            Open a counter to navigate to its shared detail Model.
          </Text>
        </View>
        <ActionButton label="Add" onPress={actions.clickedAddCounter} primary />
      </View>
      {Array.map(counters, counter => (
        <View key={counter.id} style={styles.counterCard}>
          <Pressable
            accessibilityLabel={`Open ${counter.id}`}
            accessibilityRole="button"
            onPress={() => actions.selectedCounter(counter.id)}
            style={styles.counterSummary}
          >
            <Text style={styles.counterId}>{counter.id}</Text>
            <Text style={styles.counterValue}>{counter.counter.count}</Text>
            <Text style={styles.counterOpenHint}>Open details ›</Text>
          </Pressable>
          <View style={styles.buttonRow}>
            <ActionButton
              label="−"
              onPress={() => actions.clickedDecrementCounter(counter.id)}
            />
            <ActionButton
              label="+"
              onPress={() => actions.clickedIncrementCounter(counter.id)}
            />
          </View>
        </View>
      ))}
    </View>
  )
}

const CounterDetail = ({
  counter,
  maybeMode,
}: Readonly<{
  counter: Counters.CounterRow
  maybeMode: Option.Option<Counters.CounterDetailMode>
}>) => {
  const actions = MultipleCountersClient.useActions()
  return (
    <View style={styles.example}>
      <Pressable
        accessibilityRole="button"
        onPress={actions.dismissedCounterDetail}
        style={styles.inlineBackButton}
      >
        <Text style={styles.inlineBackButtonText}>← Back to counters</Text>
      </Pressable>
      <View style={styles.counterDetailCard}>
        <Text style={styles.counterId}>{counter.id}</Text>
        <Text style={styles.counterDetailValue}>{counter.counter.count}</Text>
        <View style={styles.buttonRow}>
          <ActionButton
            label="−"
            onPress={() => actions.clickedDecrementCounter(counter.id)}
          />
          <ActionButton
            label="+"
            onPress={() => actions.clickedIncrementCounter(counter.id)}
          />
          <ActionButton
            label="Reset"
            onPress={() => actions.clickedResetCounter(counter.id)}
          />
          <ActionButton
            label="Show fact"
            onPress={actions.clickedShowCounterFact}
            primary
          />
          <DestructiveActionButton
            label="Delete counter"
            onPress={actions.clickedDeleteCounter}
          />
        </View>
      </View>
      {Option.isSome(maybeMode) ? (
        <CounterDetailPresentation
          counterId={counter.id}
          mode={maybeMode.value}
        />
      ) : null}
    </View>
  )
}

const CounterDetailPresentation = ({
  counterId,
  mode,
}: Readonly<{
  counterId: string
  mode: Counters.CounterDetailMode
}>) => {
  const actions = MultipleCountersClient.useActions()
  return M.value(mode).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      CounterFactAlert: ({ status }) => (
        <View style={styles.presentationCard}>
          {M.value(status).pipe(
            M.withReturnType<ReactNode>(),
            M.tagsExhaustive({
              LoadingCounterFact: () => (
                <Text style={styles.presentationBody}>Loading fact…</Text>
              ),
              LoadedCounterFact: ({ fact }) => (
                <View style={styles.presentationCopy}>
                  <Text style={styles.presentationTitle}>
                    Counter fact for {fact.number}
                  </Text>
                  <Text style={styles.presentationBody}>{fact.text}</Text>
                </View>
              ),
              FailedCounterFact: ({ reason }) => (
                <View style={styles.presentationCopy}>
                  <Text style={styles.presentationTitle}>
                    Counter fact unavailable
                  </Text>
                  <Text style={styles.presentationBody}>{reason}</Text>
                </View>
              ),
            }),
          )}
          <ActionButton
            label="Dismiss"
            onPress={actions.dismissedCounterFactAlert}
          />
        </View>
      ),
      DeleteCounterConfirmation: () => (
        <View style={styles.deleteConfirmation}>
          <Text style={styles.deleteConfirmationTitle}>
            Delete {counterId}?
          </Text>
          <Text style={styles.presentationBody}>
            This removes the selected Counter Submodel from the shared Program.
          </Text>
          <View style={styles.buttonRow}>
            <ActionButton
              label="Cancel"
              onPress={actions.cancelledDeleteCounter}
            />
            <DestructiveActionButton
              label="Delete"
              onPress={actions.confirmedDeleteCounter}
            />
          </View>
        </View>
      ),
    }),
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
      <ReplayControls label="Calculator replay" replay={replay} />
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
      <ReplayControls label="Fact replay" replay={replay} />
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

const DestructiveActionButton = ({
  label,
  onPress,
}: Readonly<{ label: string; onPress: () => void }>) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    style={styles.destructiveButton}
  >
    <Text style={styles.destructiveButtonText}>{label}</Text>
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
  cardboardExample: {
    borderColor: '#5f4a30',
    borderRadius: 22,
    borderWidth: 1,
    gap: 18,
    padding: 20,
  },
  cardboardHeading: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardboardEyebrow: {
    color: '#d3a861',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  cardboardTitle: {
    color: '#ffe5ae',
    fontFamily: 'serif',
    fontSize: 44,
    fontWeight: '700',
    lineHeight: 50,
  },
  cardboardRoute: { color: '#d3a861', fontFamily: 'monospace', fontSize: 15 },
  cardboardZeroButton: {
    alignItems: 'center',
    backgroundColor: '#000000',
    borderColor: '#594c3b',
    borderRadius: 16,
    borderWidth: 1,
    height: 250,
    justifyContent: 'center',
  },
  cardboardZeroButtonPressed: { opacity: 0.82, transform: [{ translateY: 9 }] },
  cardboardZeroLabel: {
    color: '#ffffff',
    fontFamily: 'serif',
    fontSize: 72,
    fontWeight: '800',
    opacity: 0.2,
  },
  cardboardProgress: {
    bottom: 14,
    color: '#f4ad48',
    fontFamily: 'monospace',
    fontSize: 12,
    position: 'absolute',
    right: 16,
  },
  cardboardReadout: {
    backgroundColor: '#332414',
    borderLeftColor: '#f4ad48',
    borderLeftWidth: 3,
    color: '#ffe5ae',
    fontSize: 15,
    lineHeight: 22,
    minHeight: 58,
    padding: 14,
  },
  cardboardConfiguration: { gap: 14 },
  cardboardProfile: {
    color: '#ffe5ae',
    fontFamily: 'serif',
    fontSize: 25,
    fontWeight: '700',
  },
  cardboardRiddle: { gap: 14 },
  cardboardRiddleTitle: {
    color: '#ffe5ae',
    fontFamily: 'serif',
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
  },
  cardboardChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cardboardChoice: {
    alignItems: 'center',
    borderColor: '#685b47',
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    justifyContent: 'center',
    minHeight: 104,
    minWidth: 128,
    padding: 12,
  },
  cardboardChoiceGlyph: {
    color: '#ffffff',
    fontFamily: 'monospace',
    fontSize: 19,
    fontWeight: '800',
  },
  cardboardChoiceLabel: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  sectionHeadingCopy: { flex: 1, gap: 5, minWidth: 0 },
  sectionTitle: { color: '#fafafa', fontSize: 24, fontWeight: '700' },
  sectionDescription: { color: '#a1a1aa', fontSize: 13, lineHeight: 18 },
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
  counterSummary: { flex: 1, minWidth: 0 },
  counterId: { color: '#a1a1aa', fontSize: 12 },
  counterValue: {
    color: '#fafafa',
    fontSize: 38,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    marginTop: 4,
  },
  counterOpenHint: {
    color: '#a3e635',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  inlineBackButton: { alignSelf: 'flex-start', paddingVertical: 8 },
  inlineBackButtonText: { color: '#a3e635', fontSize: 14, fontWeight: '700' },
  counterDetailCard: {
    backgroundColor: '#18181b',
    borderColor: '#3f3f46',
    borderRadius: 18,
    borderWidth: 1,
    gap: 18,
    padding: 22,
  },
  counterDetailValue: {
    color: '#fafafa',
    fontSize: 72,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
  presentationCard: {
    backgroundColor: '#172554',
    borderColor: '#38bdf8',
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  presentationCopy: { gap: 8 },
  presentationTitle: { color: '#e0f2fe', fontSize: 18, fontWeight: '700' },
  presentationBody: { color: '#d4d4d8', fontSize: 14, lineHeight: 21 },
  deleteConfirmation: {
    backgroundColor: '#450a0a',
    borderColor: '#f87171',
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  deleteConfirmationTitle: {
    color: '#fecaca',
    fontSize: 20,
    fontWeight: '800',
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
  destructiveButton: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    minWidth: 108,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  destructiveButtonText: {
    color: '#fff1f2',
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
