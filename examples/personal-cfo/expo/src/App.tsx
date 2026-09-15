import { Effect, Fiber, Layer, Option } from 'effect'
import { StatusBar } from 'expo-status-bar'
import { Runtime } from 'foldkit'
import {
  type Message,
  type Model,
  PersonalCfoProgram,
  RequestedChat,
  RequestedLogin,
  emptyModel,
  layerMemory,
  messageFromToken,
  personalCfoScreen,
} from 'personal-cfo-core'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

import { layerExpoNotifier } from './expoNotifier'
import { paintScreen } from './paintScreen'

const resources = Layer.merge(layerMemory, layerExpoNotifier)

type RuntimeHandle = Runtime.ProgramRuntime<Model, Message>

/** Paints personalCfoScreen. Sign-in email stays in this Client. */
export const App = () => {
  const [model, setModel] = useState<Model>(() => emptyModel())
  const [email, setEmail] = useState('alice@fake.com')
  const [question, setQuestion] = useState('What is my net worth?')
  const runtimeRef = useRef<RuntimeHandle | null>(null)

  useEffect(() => {
    let stopped = false
    const fiber = Effect.runFork(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Effect.orDie(
            Runtime.makeProgramRuntime({
              program: PersonalCfoProgram,
              resources,
            }),
          )
          if (stopped) {
            return
          }
          runtimeRef.current = runtime
          const initial = yield* runtime.initialization
          if (!stopped) {
            setModel(initial)
          }
          const unsubscribe = runtime.observeModel(next => {
            if (!stopped) {
              setModel(next)
            }
          })
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              unsubscribe()
            }),
          )
          yield* Effect.never
        }),
      ),
    )
    return () => {
      stopped = true
      runtimeRef.current = null
      Effect.runFork(Fiber.interrupt(fiber))
    }
  }, [])

  const send = (message: Message) => {
    runtimeRef.current?.send(message)
  }

  const sendToken = (token: string) => {
    if (token === 'login') {
      send(RequestedLogin({ email }))
      return
    }
    const mapped = messageFromToken(token)
    if (Option.isSome(mapped)) {
      send(mapped.value)
    }
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={{ backgroundColor: '#ffffff', flex: 1 }}>
        <ScrollView contentContainerStyle={{ gap: 16, padding: 20 }}>
          <Text
            accessibilityRole="header"
            style={{ fontSize: 22, fontWeight: '700' }}
          >
            Personal CFO
          </Text>
          {model.session._tag === 'Anonymous' ? (
            <View style={{ gap: 8 }}>
              <Text nativeID="email-label">Email</Text>
              <TextInput
                accessibilityLabel="Email"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmail}
                style={{
                  backgroundColor: '#ffffff',
                  borderColor: '#d1d5db',
                  borderRadius: 8,
                  borderWidth: 1,
                  padding: 12,
                }}
                value={email}
              />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Text nativeID="question-label">Ask the ledger</Text>
              <TextInput
                accessibilityLabel="Ask the ledger"
                onChangeText={setQuestion}
                onSubmitEditing={() => {
                  send(RequestedChat({ text: question }))
                }}
                style={{
                  backgroundColor: '#ffffff',
                  borderColor: '#d1d5db',
                  borderRadius: 8,
                  borderWidth: 1,
                  padding: 12,
                }}
                value={question}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  send(RequestedChat({ text: question }))
                }}
                style={{
                  backgroundColor: '#111827',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <Text style={{ color: '#ffffff', fontWeight: '600' }}>
                  Send chat
                </Text>
              </Pressable>
            </View>
          )}
          {paintScreen(personalCfoScreen(model), sendToken)}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
