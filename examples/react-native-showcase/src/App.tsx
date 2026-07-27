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
import { Effect, Exit, Match as M, Option, Schema as S } from 'effect'
import { StatusBar } from 'expo-status-bar'
import { FactProgram, detailForModel, displayForModel } from 'fact-core-example'
import { initialFactRoute } from 'fact-react-bindings-example'
import { Program } from 'foldkit'
import { type ReactNode, useEffect, useState } from 'react'
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

import {
  ClientPlatformDependency,
  FactClientDependency,
  ShowcaseFactClient,
} from './platform'
import { ReplayControls } from './replayControls'

const ExampleName = S.Literals(['Counter', 'Counters', 'Calculator', 'Fact'])
type ExampleName = typeof ExampleName.Type

const counterRouter = Program.makeRouter(Counter.CounterProgram)
const countersRouter = Program.makeRouter(Counters.MultipleCountersProgram)
const calculatorRouter = Program.makeRouter(Calculator.CalculatorProgram)
const factRouter = Program.makeRouter(FactProgram)

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

/** Runs the canonical examples through one Expo Web, iOS, and Android host. */
export const App = () => {
  const [example, setExample] = useState<ExampleName>('Counter')
  const [counterRoute, setCounterRoute] = useState(initialCounterRoute)
  const [countersRoute, setCountersRoute] = useState(
    initialMultipleCountersRoute,
  )
  const [calculatorRoute, setCalculatorRoute] = useState(initialCalculatorRoute)
  const [factRoute, setFactRoute] = useState(initialFactRoute)
  const [routeRevision, setRouteRevision] = useState(0)

  useEffect(() => {
    const openPortablePath = (path: string): void => {
      const selectRoute = <Model, Message extends Readonly<{ _tag: string }>>(
        selectedExample: ExampleName,
        parse: Effect.Effect<
          Program.ResolvedProgramRoute<Model, Message>,
          unknown
        >,
        setRoute: (route: Program.ResolvedProgramRoute<Model, Message>) => void,
      ): void => {
        Effect.runPromiseExit(parse).then(exit => {
          if (Exit.isSuccess(exit)) {
            setRoute(exit.value)
            setExample(selectedExample)
            setRouteRevision(revision => revision + 1)
          }
        })
      }

      if (path.startsWith('/counter/')) {
        selectRoute(
          'Counter',
          resolveInlineRoute(counterRouter.parse(path)),
          setCounterRoute,
        )
      } else if (path.startsWith('/multiple-counters/')) {
        selectRoute(
          'Counters',
          resolveInlineRoute(countersRouter.parse(path)),
          setCountersRoute,
        )
      } else if (path.startsWith('/calculator/')) {
        selectRoute(
          'Calculator',
          resolveInlineRoute(calculatorRouter.parse(path)),
          setCalculatorRoute,
        )
      } else if (path.startsWith('/fact/')) {
        selectRoute(
          'Fact',
          resolveInlineRoute(factRouter.parse(path)),
          setFactRoute,
        )
      }
    }

    const openUrl = (url: string): void => {
      openPortablePath(portablePath(url))
    }
    Linking.getInitialURL().then(url => {
      if (url !== null) {
        openUrl(url)
      } else if (Platform.OS === 'web') {
        openPortablePath(
          `${globalThis.location.pathname}${globalThis.location.search}`,
        )
      }
    })
    const subscription = Linking.addEventListener('url', ({ url }) => {
      openUrl(url)
    })
    return () => {
      subscription.remove()
    }
  }, [])

  const content = (): ReactNode => {
    if (example === 'Counter') {
      return <CounterExample key={routeRevision} route={counterRoute} />
    } else if (example === 'Counters') {
      return <CountersExample key={routeRevision} route={countersRoute} />
    } else if (example === 'Calculator') {
      return <CalculatorExample key={routeRevision} route={calculatorRoute} />
    } else {
      return <FactExample key={routeRevision} route={factRoute} />
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.shell}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Foldkit</Text>
            <Text style={styles.title}>Universal Program Showcase</Text>
          </View>
          <Text style={styles.platform}>{Platform.OS}</Text>
        </View>
        <View style={styles.tabs}>
          {ExampleName.literals.map(name => (
            <Pressable
              accessibilityRole="button"
              key={name}
              onPress={() => setExample(name)}
              style={example === name ? styles.activeTab : styles.tab}
            >
              <Text
                style={example === name ? styles.activeTabText : styles.tabText}
              >
                {name}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {content()}
        </ScrollView>
      </View>
    </SafeAreaView>
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
  },
  eyebrow: {
    color: '#a3e635',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: { color: '#fafafa', fontSize: 21, fontWeight: '700', marginTop: 4 },
  platform: {
    backgroundColor: '#27272a',
    borderRadius: 99,
    color: '#d4d4d8',
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
  content: { padding: 20, paddingBottom: 60 },
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
