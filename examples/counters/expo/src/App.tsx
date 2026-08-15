import {
  type CountersWindowActions,
  type CountersWindowModel,
} from 'counters-instant-example/native'
import { Array, Match as M } from 'effect'
import { StatusBar } from 'expo-status-bar'
import { type ReactNode, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

import { useActions, useModel } from './adapter'

const listUri = '/counters'

const counterUri = (counterId: string): string => `/counters/${counterId}`

/** Draws Multiple Counters. The window only calls useModel and useActions. */
export const App = () => {
  const [uri, setUri] = useState(listUri)
  const view = useModel(uri)
  const actions = useActions(uri)
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0c0a09' }}>
        <WindowView actions={actions} onOpen={setUri} view={view} />
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const WindowView = ({
  actions,
  onOpen,
  view,
}: Readonly<{
  actions: CountersWindowActions
  onOpen: (uri: string) => void
  view: CountersWindowModel
}>) =>
  M.value(view).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      StartingWindow: () => (
        <Text style={{ color: '#fafaf9', padding: 24 }}>
          Starting Instant Multiple Counters…
        </Text>
      ),
      FailedWindow: ({ error }) => (
        <View style={{ padding: 24, gap: 12 }}>
          <Text style={{ color: '#fafaf9' }}>{error}</Text>
          <Pressable
            accessibilityLabel="Sign in with Access"
            accessibilityRole="button"
            onPress={actions.signIn}
          >
            <Text style={{ color: '#fbbf24' }}>Sign in with Access</Text>
          </Pressable>
        </View>
      ),
      ReadyWindow: ready => (
        <ReadyView actions={actions} onOpen={onOpen} view={ready} />
      ),
    }),
  )

const ReadyView = ({
  actions,
  onOpen,
  view,
}: Readonly<{
  actions: CountersWindowActions
  onOpen: (uri: string) => void
  view: Extract<CountersWindowModel, { readonly _tag: 'ReadyWindow' }>
}>) => {
  if (view.selectedId !== undefined && view.count !== undefined) {
    return (
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        <Text style={{ color: '#fbbf24', fontSize: 12, fontWeight: '700' }}>
          FOLDKIT COUNTERS
        </Text>
        <Text style={{ color: '#fbbf24', fontFamily: 'monospace' }}>
          {view.selectedId}
        </Text>
        <Text style={{ color: '#fafaf9', fontSize: 56, fontWeight: '700' }}>
          {view.count.toString()}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Action label="+" onPress={actions.increment} />
          <Action label="-" onPress={actions.decrement} />
          <Action label="Reset" onPress={actions.reset} />
          <Action label="Fact" onPress={actions.showFact} />
          <Action
            label="Back"
            onPress={() => {
              actions.back()
              onOpen(listUri)
            }}
          />
        </View>
      </ScrollView>
    )
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Text style={{ color: '#fbbf24', fontSize: 12, fontWeight: '700' }}>
        FOLDKIT COUNTERS
      </Text>
      <Text style={{ color: '#fafaf9', fontSize: 28, fontWeight: '600' }}>
        Multiple counters
      </Text>
      <View style={{ gap: 12 }}>
        {Array.map(view.counters, counter => (
          <Pressable
            accessibilityLabel={counter.id}
            accessibilityRole="button"
            key={counter.id}
            onPress={() => {
              actions.open(counter.id)
              onOpen(counterUri(counter.id))
            }}
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
              {counter.count.toString()}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={actions.addCounter}
        style={{ backgroundColor: '#fbbf24', borderRadius: 16, padding: 16 }}
      >
        <Text style={{ fontWeight: '700' }}>Add counter</Text>
      </Pressable>
    </ScrollView>
  )
}

const Action = ({
  label,
  onPress,
}: Readonly<{ label: string; onPress: () => void }>) => (
  <Pressable
    accessibilityLabel={label}
    accessibilityRole="button"
    onPress={onPress}
    style={{ backgroundColor: '#292524', borderRadius: 999, padding: 12 }}
  >
    <Text style={{ color: '#fafaf9' }}>{label}</Text>
  </Pressable>
)
