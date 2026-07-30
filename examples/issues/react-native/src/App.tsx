import { Array, Match as M, Option } from 'effect'
import * as Linking from 'expo-linking'
import { StatusBar } from 'expo-status-bar'
import { Program } from 'foldkit'
import {
  type Destination,
  type IssueDetailState,
  type IssueDraft,
  type IssuesState,
  type TriageCandidatesState,
  destinationForModel,
  modelForNavigation,
  navigationToPath,
  pathToNavigation,
} from 'issues-core-example'
import { StaticIssueTrackerClient } from 'issues-react-bindings-example'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import {
  DarkTheme,
  NavigationContainer,
  StackActions,
  createNavigationContainerRef,
} from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import {
  NativeIssueRoute,
  nativeIssueReconciliation,
} from './navigationReconciliation'

type NativeStackParamList = Readonly<{
  Destination: undefined
  Issues: undefined
}>

const NativeStack = createNativeStackNavigator<NativeStackParamList>()
const navigationRef = createNavigationContainerRef<NativeStackParamList>()
const priorities: ReadonlyArray<IssueDraft['priority']> = [
  'P0',
  'P1',
  'P2',
  'P3',
  'P4',
]

/** Runs Issue Tracker in an Expo iOS, Android, and Web carrier. */
export const App = () => {
  const [initialCarrier, setInitialCarrier] = useState<string>()
  useEffect(() => {
    Linking.getInitialURL().then(url => setInitialCarrier(url ?? '/issues'))
  }, [])
  if (initialCarrier === undefined) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.muted}>Starting Issue Tracker…</Text>
      </SafeAreaView>
    )
  }
  return (
    <SafeAreaProvider>
      <StaticIssueTrackerClient.Provider
        fallback={<Text style={styles.muted}>Observing Issues…</Text>}
        initialRoute={Program.state(
          modelForNavigation(pathToNavigation(initialCarrier)),
        )}
      >
        <IssueTrackerNavigation />
      </StaticIssueTrackerClient.Provider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  )
}

const IssueTrackerNavigation = () => {
  const model = StaticIssueTrackerClient.useModel()
  const actions = StaticIssueTrackerClient.useActions()
  const [isReady, setReady] = useState(false)

  useEffect(
    () =>
      Linking.addEventListener('url', event =>
        actions.openedNavigation(pathToNavigation(event.url)),
      ).remove,
    [actions],
  )

  useEffect(() => {
    if (!isReady || !navigationRef.isReady()) return
    const current = navigationRef.getCurrentRoute()
    if (current === undefined) return
    const nativeRoute = NativeIssueRoute.make(current.name)
    M.value(nativeIssueReconciliation(model.navigation, nativeRoute)).pipe(
      M.tagsExhaustive({
        KeptNativeIssueRoute: () => undefined,
        PushedNativeIssueDestination: () =>
          navigationRef.navigate('Destination'),
        PoppedNativeIssueDestination: () =>
          navigationRef.dispatch(StackActions.popToTop()),
      }),
    )
  }, [isReady, model.navigation])

  const changedNativeState = useCallback(() => {
    if (!navigationRef.isReady()) return
    const current = navigationRef.getCurrentRoute()
    if (current?.name === 'Issues' && model.navigation._tag !== 'IssueList') {
      actions.dismissedDestination()
    }
  }, [actions, model.navigation])

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={DarkTheme}
      onReady={() => setReady(true)}
      onStateChange={changedNativeState}
    >
      <NativeStack.Navigator>
        <NativeStack.Screen
          component={IssueListScreen}
          name="Issues"
          options={{ title: 'Issues' }}
        />
        <NativeStack.Screen
          component={DestinationScreen}
          name="Destination"
          options={{ title: navigationTitle(model.navigation._tag) }}
        />
      </NativeStack.Navigator>
    </NavigationContainer>
  )
}

const navigationTitle = (tag: string): string => {
  if (tag === 'IssueDetail') return 'Issue'
  if (tag === 'FileIssue') return 'File issue'
  if (tag === 'TriageInbox') return 'Triage'
  return 'Issues'
}

const Shell = ({ children }: { children: ReactNode }) => (
  <SafeAreaView style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
  </SafeAreaView>
)

const IssueListScreen = () => {
  const model = StaticIssueTrackerClient.useModel()
  const actions = StaticIssueTrackerClient.useActions()
  return (
    <Shell>
      <Text style={styles.eyebrow}>Foldkit Program · React Native Client</Text>
      <Text style={styles.title}>Issues</Text>
      <Text style={styles.muted}>{navigationToPath(model.navigation)}</Text>
      <View style={styles.actions}>
        <Action label="File issue" onPress={actions.clickedFileIssue} />
        <Action label="Triage" onPress={actions.clickedOpenTriage} secondary />
      </View>
      <IssueListView state={model.issues} />
    </Shell>
  )
}

const DestinationScreen = () => {
  const model = StaticIssueTrackerClient.useModel()
  return (
    <Shell>
      <DestinationView destination={destinationForModel(model)} />
    </Shell>
  )
}

const DestinationView = ({ destination }: { destination: Destination }) =>
  M.value(destination).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      IssueListDestination: ({ state }) => <IssueListView state={state} />,
      IssueDetailDestination: ({ state }) => <IssueDetailView state={state} />,
      FileIssueDestination: () => <FileIssueView />,
      TriageInboxDestination: ({ state }) => <TriageInboxView state={state} />,
    }),
  )

const IssueListView = ({ state }: { state: IssuesState }) => {
  const actions = StaticIssueTrackerClient.useActions()
  if (state._tag !== 'LoadedIssues') {
    return <Text style={styles.muted}>{state._tag}</Text>
  }
  return (
    <View style={styles.list}>
      {Array.map(state.issues, issue => (
        <Pressable
          key={issue.id}
          onPress={() => actions.selectedIssue(issue.id)}
          style={styles.card}
        >
          <Text style={styles.eyebrow}>
            {issue.priority} · {issue.id}
          </Text>
          <Text style={styles.heading}>{issue.title}</Text>
          <Text style={styles.muted}>
            {issue.product._tag} · {issue.product.name} · {issue.status}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

const IssueDetailView = ({ state }: { state: IssueDetailState }) => {
  if (state._tag !== 'LoadedIssue' || Option.isNone(state.issue)) {
    return <Text style={styles.muted}>{state._tag}</Text>
  }
  const issue = state.issue.value
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>
        {issue.priority} · {issue.id}
      </Text>
      <Text style={styles.title}>{issue.title}</Text>
      <Text style={styles.body}>{issue.details}</Text>
      <Text style={styles.muted}>
        {issue.product._tag} · {issue.product.name} · {issue.status}
      </Text>
    </View>
  )
}

const TriageInboxView = ({ state }: { state: TriageCandidatesState }) => {
  const actions = StaticIssueTrackerClient.useActions()
  if (state._tag !== 'LoadedTriageCandidates') {
    return <Text style={styles.muted}>{state._tag}</Text>
  }
  return (
    <View style={styles.list}>
      <Text style={styles.title}>Triage inbox</Text>
      {Array.map(state.candidates, candidate => (
        <View key={candidate.id} style={styles.card}>
          <Text style={styles.eyebrow}>
            {candidate.status} · {candidate.suggestedPriority}
          </Text>
          <Text style={styles.heading}>{candidate.suggestedTitle}</Text>
          <Text style={styles.body}>{candidate.segment.transcript}</Text>
          <Text style={styles.muted}>
            {Math.round(candidate.segment.startMilliseconds / 1000)}s–
            {Math.round(candidate.segment.endMilliseconds / 1000)}s
          </Text>
          {candidate.status === 'Draft' ? (
            <View style={styles.actions}>
              <Action
                label="Promote"
                onPress={() => actions.promotedTriageCandidate(candidate.id)}
              />
              <Action
                label="Dismiss"
                onPress={() => actions.dismissedTriageCandidate(candidate.id)}
                secondary
              />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  )
}

const FileIssueView = () => {
  const model = StaticIssueTrackerClient.useModel()
  const actions = StaticIssueTrackerClient.useActions()
  const products =
    model.products._tag === 'LoadedProducts' ? model.products.products : []
  return (
    <View style={styles.card}>
      <Text style={styles.title}>File an issue</Text>
      <TextInput
        onChangeText={actions.updatedTitle}
        placeholder="Title"
        placeholderTextColor="#78716c"
        style={styles.input}
        value={model.draft.title}
      />
      <Text style={styles.label}>Application or Library</Text>
      <View style={styles.actions}>
        {Array.map(products, entry => (
          <Action
            key={entry.product.id}
            label={entry.product.name}
            onPress={() => actions.selectedProduct(entry.product.id)}
            secondary={model.draft.productId !== entry.product.id}
          />
        ))}
      </View>
      <Text style={styles.label}>Priority</Text>
      <View style={styles.actions}>
        {Array.map(priorities, priority => (
          <Action
            key={priority}
            label={priority}
            onPress={() => actions.selectedPriority(priority)}
            secondary={model.draft.priority !== priority}
          />
        ))}
      </View>
      <TextInput
        multiline
        onChangeText={actions.updatedDetails}
        placeholder="Details"
        placeholderTextColor="#78716c"
        style={[styles.input, styles.details]}
        value={model.draft.details}
      />
      {model.draftState._tag === 'FailedIssueDraft' ? (
        <Text style={styles.error}>{model.draftState.reason}</Text>
      ) : null}
      <Action label="File issue" onPress={actions.submittedIssue} />
    </View>
  )
}

const Action = ({
  label,
  onPress,
  secondary = false,
}: Readonly<{
  label: string
  onPress: () => void
  secondary?: boolean
}>) => (
  <Pressable
    onPress={onPress}
    style={[styles.button, secondary ? styles.secondaryButton : undefined]}
  >
    <Text style={secondary ? styles.secondaryButtonText : styles.buttonText}>
      {label}
    </Text>
  </Pressable>
)

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  body: { color: '#d6d3d1', fontSize: 16, lineHeight: 24 },
  button: {
    backgroundColor: '#fbbf24',
    borderColor: '#fbbf24',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: { color: '#1c1917', fontWeight: '700' },
  card: {
    backgroundColor: '#1c1917',
    borderColor: '#44403c',
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 20,
  },
  content: { gap: 20, padding: 20 },
  details: { minHeight: 120, textAlignVertical: 'top' },
  error: { color: '#fca5a5' },
  eyebrow: {
    color: '#fbbf24',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heading: { color: '#fafaf9', fontSize: 20, fontWeight: '700' },
  input: {
    borderColor: '#57534e',
    borderRadius: 12,
    borderWidth: 1,
    color: '#fafaf9',
    padding: 12,
  },
  label: { color: '#d6d3d1', fontWeight: '600' },
  list: { gap: 12 },
  muted: { color: '#a8a29e' },
  safeArea: { backgroundColor: '#0c0a09', flex: 1 },
  secondaryButton: { backgroundColor: 'transparent', borderColor: '#78716c' },
  secondaryButtonText: { color: '#d6d3d1', fontWeight: '600' },
  title: { color: '#fafaf9', fontSize: 32, fontWeight: '700' },
})
