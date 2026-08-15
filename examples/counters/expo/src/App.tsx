import {
  type CounterDetailMode,
  type Destination,
  destinationForModel,
} from 'counters-core-example'
import {
  countersProcessorIds,
  instantCountersResources,
  observeRemoteCountersTape,
  openCountersTapeRuntime,
} from 'counters-instant-example'
import { openNativeCountersTape } from 'counters-instant-example/native'
import {
  type MultipleCountersHost,
  MultipleCountersProvider,
  useMultipleCountersActions,
  useMultipleCountersModel,
} from 'counters-react-bindings-example'
import { Array, Effect, Exit, Match as M, Option, Scope } from 'effect'
import { StatusBar } from 'expo-status-bar'
import { type ReactNode, useEffect, useState } from 'react'
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native'
import 'react-native-get-random-values'

import { ensureHostedInstantSession } from '@foldkit/instant'
import { init } from '@instantdb/core'

import { loadStoredAccessToken, requestKnophyAccessToken } from './access.js'

const instantAppId = (): string | undefined => {
  const appId = process.env['EXPO_PUBLIC_INSTANT_APP_ID']
  if (appId === undefined || appId === '') {
    return undefined
  }
  return appId
}

const processorId = (): string =>
  Platform.OS === 'ios'
    ? countersProcessorIds.expoIos
    : countersProcessorIds.expoAndroid

const startExpoCountersHost = (
  appId: string,
  onHost: (host: MultipleCountersHost) => void,
): (() => void) => {
  const scope = Effect.runSync(Scope.make())
  void Effect.runPromise(
    Effect.gen(function* () {
      const token = yield* Effect.promise(() => loadStoredAccessToken())
      const database = init({ appId })
      if (token !== undefined) {
        yield* Effect.promise(() =>
          ensureHostedInstantSession(database, { accessToken: token }),
        )
      }
      const tape = yield* openNativeCountersTape(
        appId,
        processorId(),
        process.env['EXPO_PUBLIC_COUNTERS_DEMO_SESSION_URL'],
      )
      if (tape === null) {
        return
      }
      const opened = yield* openCountersTapeRuntime(
        tape,
        instantCountersResources,
      )
      onHost({
        isInstantTape: true,
        readModel: () => opened.runtime.readModel(),
        send: opened.sendClientInput,
        subscribe: listener => opened.runtime.observeModel(listener),
      })
      yield* observeRemoteCountersTape(
        tape,
        opened.runtime,
        processorId(),
      ).pipe(Effect.forkChild)
      return yield* Effect.never
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
  return () => {
    void Effect.runPromise(Scope.close(scope, Exit.void))
  }
}

/** Runs Multiple Counters on Instant tape for iOS and Android. */
export const App = () => {
  const appId = instantAppId()
  const [host, setHost] = useState<MultipleCountersHost | null>(null)
  useEffect(() => {
    if (appId === undefined) {
      return
    }
    return startExpoCountersHost(appId, setHost)
  }, [appId])

  if (appId === undefined) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0c0a09' }}>
        <Text style={{ color: '#fafaf9', padding: 24 }}>
          EXPO_PUBLIC_INSTANT_APP_ID is missing. Start through the Instant demo
          wrapper.
        </Text>
      </SafeAreaView>
    )
  }

  if (host === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0c0a09' }}>
        <Text style={{ color: '#fafaf9', padding: 24 }}>
          Starting Instant Multiple Counters…
        </Text>
        <Pressable
          onPress={() => {
            void requestKnophyAccessToken()
          }}
          style={{ padding: 24 }}
        >
          <Text style={{ color: '#fbbf24' }}>Sign in with Access</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <MultipleCountersProvider host={host} initialDestinationUri="/counters">
      <StatusBar style="light" />
      <CountersScreen />
    </MultipleCountersProvider>
  )
}

const CountersScreen = () => {
  const model = useMultipleCountersModel()
  const actions = useMultipleCountersActions()
  const destination = destinationForModel(model)
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0c0a09' }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        <Text style={{ color: '#fbbf24', fontSize: 12, fontWeight: '700' }}>
          FOLDKIT COUNTERS
        </Text>
        <Text style={{ color: '#fafaf9', fontSize: 28, fontWeight: '600' }}>
          Multiple counters
        </Text>
        <DestinationView actions={actions} destination={destination} />
        <Pressable
          onPress={actions.clickedAddCounter}
          style={{ backgroundColor: '#fbbf24', borderRadius: 16, padding: 16 }}
        >
          <Text style={{ fontWeight: '700' }}>Add counter</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const DestinationView = ({
  actions,
  destination,
}: Readonly<{
  actions: ReturnType<typeof useMultipleCountersActions>
  destination: Destination
}>) =>
  M.value(destination).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      CounterListDestination: ({ counters }) => (
        <View style={{ gap: 12 }}>
          {Array.map(counters, counter => (
            <Pressable
              key={counter.id}
              onPress={() => actions.selectedCounter(counter.id)}
              style={{
                backgroundColor: '#1c1917',
                borderRadius: 16,
                padding: 16,
              }}
            >
              <Text style={{ color: '#fbbf24', fontFamily: 'monospace' }}>
                {counter.id}
              </Text>
              <Text style={{ color: '#fafaf9', fontSize: 32 }}>
                {counter.counter.count.toString()}
              </Text>
            </Pressable>
          ))}
        </View>
      ),
      CounterDetailDestination: ({ counter, maybeMode }) => (
        <DetailCard
          actions={actions}
          count={counter.counter.count}
          counterId={counter.id}
          maybeMode={maybeMode}
        />
      ),
    }),
  )

const DetailCard = ({
  actions,
  count,
  counterId,
  maybeMode,
}: Readonly<{
  actions: ReturnType<typeof useMultipleCountersActions>
  count: number
  counterId: string
  maybeMode: Option.Option<CounterDetailMode>
}>) => (
  <View style={{ backgroundColor: '#1c1917', borderRadius: 24, padding: 20 }}>
    <Text style={{ color: '#fbbf24', fontFamily: 'monospace' }}>
      {counterId}
    </Text>
    <Text style={{ color: '#fafaf9', fontSize: 56, fontWeight: '700' }}>
      {count.toString()}
    </Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Action
        label="+"
        onPress={() => actions.clickedIncrementCounter(counterId)}
      />
      <Action
        label="-"
        onPress={() => actions.clickedDecrementCounter(counterId)}
      />
      <Action
        label="Reset"
        onPress={() => actions.clickedResetCounter(counterId)}
      />
      <Action label="Fact" onPress={actions.clickedShowCounterFact} />
      <Action label="Back" onPress={actions.dismissedCounterDetail} />
    </View>
    {Option.isSome(maybeMode) ? (
      <Text style={{ color: '#a8a29e', marginTop: 12 }}>
        {maybeMode.value._tag}
      </Text>
    ) : null}
  </View>
)

const Action = ({
  label,
  onPress,
}: Readonly<{ label: string; onPress: () => void }>) => (
  <Pressable
    onPress={onPress}
    style={{ backgroundColor: '#292524', borderRadius: 999, padding: 12 }}
  >
    <Text style={{ color: '#fafaf9' }}>{label}</Text>
  </Pressable>
)
