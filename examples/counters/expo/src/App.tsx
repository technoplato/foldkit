import {
  type CountersWindowActions,
  type CountersWindowModel,
  countersProcessorIds,
} from 'counters-instant-example/native'
import { Array, Match as M } from 'effect'
import { StatusBar } from 'expo-status-bar'
import {
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

import { useActions, useModel } from './adapter'

const listUri = '/counters'

const censusDebugStampFile = 'census/debug-stamp.json'

const counterUri = (counterId: string): string => `/counters/${counterId}`

type DebugStamp = Readonly<{
  builtAt: number | undefined
  commit: string
  dirty: boolean
  nonce: string
  short: string
}>

const missingDebugStamp: DebugStamp = {
  builtAt: undefined,
  commit: 'unknown',
  dirty: false,
  nonce: '----',
  short: 'unknown',
}

const parseDebugStamp = (value: unknown): DebugStamp | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  if (!('nonce' in value) || !('commit' in value)) {
    return undefined
  }
  if (typeof value.nonce !== 'string' || value.nonce === '') {
    return undefined
  }
  if (typeof value.commit !== 'string' || value.commit === '') {
    return undefined
  }
  const shortValue = 'short' in value ? value.short : undefined
  const builtAtValue = 'builtAt' in value ? value.builtAt : undefined
  const dirtyValue = 'dirty' in value ? value.dirty : undefined
  const short =
    typeof shortValue === 'string' && shortValue !== ''
      ? shortValue
      : value.commit.slice(0, 8)
  const builtAt =
    typeof builtAtValue === 'number' && Number.isFinite(builtAtValue)
      ? builtAtValue
      : undefined
  return {
    builtAt,
    commit: value.commit,
    dirty: dirtyValue === true,
    nonce: value.nonce,
    short,
  }
}

const stampFromCensusDebugStamp = (): DebugStamp => {
  const raw = process.env['EXPO_PUBLIC_DIR_DEBUG_STAMP']
  if (raw !== undefined && raw !== '') {
    try {
      const parsed: unknown = JSON.parse(raw)
      const stamp = parseDebugStamp(parsed)
      if (stamp !== undefined) {
        return stamp
      }
    } catch {
      return missingDebugStamp
    }
    return missingDebugStamp
  }
  const nonce = process.env['EXPO_PUBLIC_DIR_NONCE']
  const commit = process.env['EXPO_PUBLIC_DIR_COMMIT']
  if (
    (nonce === undefined || nonce === '') &&
    (commit === undefined || commit === '')
  ) {
    return missingDebugStamp
  }
  const nextCommit = commit !== undefined && commit !== '' ? commit : 'unknown'
  const builtAtRaw = process.env['EXPO_PUBLIC_DIR_BUILT_AT']
  const builtAtParsed =
    builtAtRaw === undefined || builtAtRaw === ''
      ? Number.NaN
      : Number.parseInt(builtAtRaw, 10)
  return {
    builtAt: Number.isFinite(builtAtParsed) ? builtAtParsed : undefined,
    commit: nextCommit,
    dirty: process.env['EXPO_PUBLIC_DIR_DIRTY'] === '1',
    nonce: nonce !== undefined && nonce !== '' ? nonce : '----',
    short: nextCommit === 'unknown' ? 'unknown' : nextCommit.slice(0, 8),
  }
}

const loadCensusDebugStamp = (): Promise<DebugStamp | undefined> => {
  const url = process.env['EXPO_PUBLIC_DIR_DEBUG_STAMP_URL']
  if (url === undefined || url === '') {
    return Promise.resolve(undefined)
  }
  return fetch(url)
    .then(response => {
      if (!response.ok) {
        return undefined
      }
      return response.json()
    })
    .then(body => parseDebugStamp(body))
    .catch(() => undefined)
}

const ageLabel = (builtAt: number): string => {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - builtAt))
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m`
  }
  return `${Math.floor(minutes / 60)}h`
}

const overlayLine = (stamp: DebugStamp): string => {
  if (stamp.builtAt === undefined) {
    if (stamp.dirty) {
      return `${stamp.short} dirty nonce=${stamp.nonce}`
    }
    return `${stamp.short} nonce=${stamp.nonce}`
  }
  const age = ageLabel(stamp.builtAt)
  if (stamp.dirty) {
    return `${stamp.short} dirty ${age} nonce=${stamp.nonce}`
  }
  return `${stamp.short} ${age} nonce=${stamp.nonce}`
}

const printChangeUrl = (): string => {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8768/print-change'
  }
  return 'http://127.0.0.1:8768/print-change'
}

const hostName = (): string => {
  if (Platform.OS === 'ios') {
    return 'expo-ios'
  }
  return 'expo-android'
}

const processorIdForHost = (): string => {
  if (Platform.OS === 'ios') {
    return countersProcessorIds.expoIos
  }
  return countersProcessorIds.expoAndroid
}

const modelFromView = (
  view: CountersWindowModel,
): Readonly<Record<string, number | string>> => {
  if (view._tag === 'ReadyWindow') {
    const emptyCounts: Record<string, number> = {}
    return Array.reduce(view.counters, emptyCounts, (counts, counter) => ({
      ...counts,
      [counter.id]: counter.count,
    }))
  }
  if (view._tag === 'FailedWindow') {
    return { error: view.error }
  }
  return { window: 'StartingWindow' }
}

const postPrintChange = (
  stamp: DebugStamp,
  messageToken: string,
  view: CountersWindowModel,
): void => {
  fetch(printChangeUrl(), {
    body: JSON.stringify({
      commit: stamp.short,
      device: 'phone',
      host: hostName(),
      kind: 'printChange',
      messageToken,
      model: modelFromView(view),
      nonce: stamp.nonce,
      processorId: processorIdForHost(),
      stampFile: censusDebugStampFile,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }).catch(() => undefined)
}

const actionsWithMessageToken = (
  actions: CountersWindowActions,
  lastMessageToken: MutableRefObject<string>,
): CountersWindowActions => ({
  addCounter: () => {
    lastMessageToken.current = 'addCounter'
    actions.addCounter()
  },
  back: () => {
    lastMessageToken.current = 'back'
    actions.back()
  },
  decrement: () => {
    lastMessageToken.current = 'decrement'
    actions.decrement()
  },
  increment: () => {
    lastMessageToken.current = 'increment'
    actions.increment()
  },
  open: counterId => {
    lastMessageToken.current = 'open'
    actions.open(counterId)
  },
  reset: () => {
    lastMessageToken.current = 'reset'
    actions.reset()
  },
  showFact: () => {
    lastMessageToken.current = 'showFact'
    actions.showFact()
  },
  signIn: () => {
    lastMessageToken.current = 'signIn'
    actions.signIn()
  },
})

/** Draws Multiple Counters. The window only calls useModel and useActions. */
export const App = () => {
  const [uri, setUri] = useState(listUri)
  const view = useModel(uri)
  const actions = useActions(uri)
  const [stamp, setStamp] = useState(stampFromCensusDebugStamp)
  const lastMessageToken = useRef('model')
  const loggedActions = useMemo(
    () => actionsWithMessageToken(actions, lastMessageToken),
    [actions],
  )
  useEffect(() => {
    loadCensusDebugStamp().then(loaded => {
      if (loaded !== undefined) {
        setStamp(loaded)
      }
    })
  }, [])
  useEffect(() => {
    postPrintChange(stamp, lastMessageToken.current, view)
    lastMessageToken.current = 'model'
  }, [stamp, view])
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0c0a09' }}>
        <WindowView actions={loggedActions} onOpen={setUri} view={view} />
        <DebugOverlay line={overlayLine(stamp)} />
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const DebugOverlay = ({ line }: Readonly<{ line: string }>) => (
  <View
    pointerEvents="none"
    style={{
      backgroundColor: 'rgba(12, 10, 9, 0.72)',
      bottom: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      position: 'absolute',
      right: 8,
    }}
  >
    <Text
      accessibilityLabel={line}
      style={{ color: '#a8a29e', fontFamily: 'monospace', fontSize: 10 }}
    >
      {line}
    </Text>
  </View>
)

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
