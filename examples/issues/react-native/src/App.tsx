import { Array, Match as M, Option } from 'effect'
import * as Linking from 'expo-linking'
import { StatusBar } from 'expo-status-bar'
import { Program } from 'foldkit'
import { type UiNode } from 'foldkit/renderers'
import {
  Interaction,
  issuesScreen,
  messageForScreenToken,
  modelForNavigation,
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
    if (!isReady || !navigationRef.isReady()) {
      return
    }
    const current = navigationRef.getCurrentRoute()
    if (current === undefined) {
      return
    }
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
    if (!navigationRef.isReady()) {
      return
    }
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
          component={IssueScreen}
          name="Issues"
          options={{ title: 'Issues' }}
        />
        <NativeStack.Screen
          component={IssueScreen}
          name="Destination"
          options={{ title: 'Issues' }}
        />
      </NativeStack.Navigator>
    </NavigationContainer>
  )
}

const paintNative = (
  node: UiNode,
  send: (token: string) => void,
): ReactNode => {
  if (node._tag === 'Text') {
    return <Text style={styles.muted}>{node.content}</Text>
  }
  if (node._tag === 'Button') {
    const token = node.token
    return (
      <Pressable
        onPress={() => {
          if (token !== undefined) {
            send(token)
          }
        }}
        style={styles.card}
      >
        <Text style={styles.title}>{node.label}</Text>
      </Pressable>
    )
  }
  if (node._tag === 'TextInput') {
    const token = node.token
    return (
      <TextInput
        onChangeText={value => {
          if (token !== undefined) {
            send(`${token}${value}`)
          }
        }}
        placeholder={node.placeholder}
        style={styles.input}
        value={node.value}
      />
    )
  }
  if (
    node._tag === 'Column' ||
    node._tag === 'Row' ||
    node._tag === 'Box' ||
    node._tag === 'DeviceShell'
  ) {
    return (
      <View style={styles.content}>
        {Array.map(node.children, (child, index) => (
          <View key={`${child._tag}-${index.toString()}`}>
            {paintNative(child, send)}
          </View>
        ))}
      </View>
    )
  }
  return <Text style={styles.muted}>{node._tag}</Text>
}

const IssueScreen = () => {
  const model = StaticIssueTrackerClient.useModel()
  const actions = StaticIssueTrackerClient.useActions()
  const send = (token: string) => {
    const maybe = messageForScreenToken(model, token)
    if (Option.isSome(maybe)) {
      actions.performed(
        Interaction.make({
          label: token,
          message: maybe.value,
          token,
        }),
      )
    }
  }
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {paintNative(issuesScreen(model), send)}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1c1917',
    borderColor: '#44403c',
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 20,
  },
  content: { gap: 20, padding: 20 },
  input: {
    backgroundColor: '#1c1917',
    borderColor: '#44403c',
    borderRadius: 12,
    borderWidth: 1,
    color: '#fafaf9',
    fontSize: 18,
    padding: 12,
  },
  muted: { color: '#a8a29e' },
  safeArea: { backgroundColor: '#0c0a09', flex: 1 },
  title: { color: '#fafaf9', fontSize: 32, fontWeight: '700' },
})
