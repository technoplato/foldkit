import { Match as M, Option } from 'effect'
import { StatusBar } from 'expo-status-bar'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { logBuildProvenance } from './buildProvenance'
import {
  type Authentication,
  FailedAuthentication,
  NativeCounterController,
  type NativeCounterViewState,
  RestoringAuthentication,
  SignedInAuthentication,
  SignedOutAuthentication,
} from './controller'
import { nativeDatabase } from './nativeDatabase'
import { makeNativeProcessorGateway } from './processorGateway'

const processorGateway = makeNativeProcessorGateway(nativeDatabase)

const makeController = (): NativeCounterController =>
  new NativeCounterController({
    authentication: {
      sendMagicCode: email =>
        nativeDatabase.auth.sendMagicCode({ email }).then(() => undefined),
      signInWithMagicCode: (email, code) =>
        nativeDatabase.auth
          .signInWithMagicCode({ code, email })
          .then(() => undefined),
      signOut: () => nativeDatabase.auth.signOut(),
    },
    processorGateway,
  })

const authenticationLabel = (authentication: Authentication): string =>
  M.value(authentication).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      FailedAuthentication: () => 'Failed',
      RestoringAuthentication: () => 'Restoring',
      SignedInAuthentication: () => 'Signed in',
      SignedOutAuthentication: () => 'Signed out',
      SigningOutAuthentication: () => 'Signing out',
    }),
  )

const processorLifecycleLabel = (state: NativeCounterViewState): string =>
  M.value(state.processorLifecycle).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      DisconnectedProcessor: () => 'Disconnected',
      DisconnectingProcessor: () => 'Disconnecting',
      FailedProcessor: () => 'Failed',
      IdleProcessor: () => 'Idle',
      ReadyProcessor: () => 'Ready',
      ReconnectingProcessor: () => 'Reconnecting',
      StartingProcessor: () => 'Starting',
      StoppingProcessor: () => 'Stopping',
    }),
  )

/** Runs the authenticated Instant Counter through a real native Processor. */
export const App = () => {
  const [controller] = useState(makeController)
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )
  const authentication = nativeDatabase.useAuth()
  const transportStatus = nativeDatabase.useConnectionStatus()
  const isAuthenticationLoading = authentication.isLoading
  const isAuthenticationFailed = authentication.error !== undefined
  const authenticatedSubjectId = authentication.user?.id
  const authenticatedEmail = authentication.user?.email
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [maybeSentEmail, setMaybeSentEmail] = useState<Option.Option<string>>(
    Option.none(),
  )

  useEffect(logBuildProvenance, [])

  useEffect(() => {
    if (isAuthenticationLoading) {
      controller.authenticationChanged(RestoringAuthentication.make({}))
    } else if (isAuthenticationFailed) {
      controller.authenticationChanged(
        FailedAuthentication.make({
          reason: 'Instant could not restore native authentication.',
        }),
      )
    } else if (authenticatedSubjectId !== undefined) {
      controller.authenticationChanged(
        SignedInAuthentication.make({
          maybeEmail: Option.fromNullishOr(authenticatedEmail),
          subjectId: authenticatedSubjectId,
        }),
      )
    } else {
      controller.authenticationChanged(SignedOutAuthentication.make({}))
    }
  }, [
    authenticatedEmail,
    authenticatedSubjectId,
    controller,
    isAuthenticationFailed,
    isAuthenticationLoading,
  ])

  useEffect(() => {
    controller.transportChanged(transportStatus)
  }, [controller, transportStatus])

  useEffect(
    () => () => {
      void controller.dispose()
    },
    [controller],
  )

  const sendMagicCode = useCallback(() => {
    const normalizedEmail = email.trim()
    if (normalizedEmail.length === 0) {
      return
    }
    void controller.sendMagicCode(normalizedEmail).then(isSendSuccessful => {
      if (isSendSuccessful) {
        setMaybeSentEmail(Option.some(normalizedEmail))
      }
    })
  }, [controller, email])

  const verifyMagicCode = useCallback(() => {
    if (Option.isNone(maybeSentEmail) || code.trim().length === 0) {
      return
    }
    void controller
      .signInWithMagicCode(maybeSentEmail.value, code.trim())
      .then(isSignInSuccessful => {
        if (!isSignInSuccessful) {
          setCode('')
        }
      })
  }, [code, controller, maybeSentEmail])

  const signOut = useCallback(() => {
    setMaybeSentEmail(Option.none())
    setCode('')
    void controller.signOut()
  }, [controller])

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>FOLDKIT · INSTANT</Text>
            <Text style={styles.title}>Shared Counter</Text>
            <Text style={styles.subtitle}>
              Valid native proposals project immediately. Every Processor then
              converges on the accepted Instant tape.
            </Text>
          </View>

          <AuthenticationCard
            authentication={state.authentication}
            code={code}
            email={email}
            maybeSentEmail={maybeSentEmail}
            sendMagicCode={sendMagicCode}
            setCode={setCode}
            setEmail={setEmail}
            setMaybeSentEmail={setMaybeSentEmail}
            signOut={signOut}
            verifyMagicCode={verifyMagicCode}
          />

          {state.authentication._tag === 'SignedInAuthentication' ? (
            <>
              <CounterCard controller={controller} state={state} />
              <ConnectionCard controller={controller} state={state} />
            </>
          ) : null}

          {Option.isSome(state.maybeNotice) ? (
            <View
              accessibilityLiveRegion="polite"
              style={styles.notice}
              testID="notice"
            >
              <Text style={styles.noticeText}>{state.maybeNotice.value}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const AuthenticationCard = ({
  authentication,
  code,
  email,
  maybeSentEmail,
  sendMagicCode,
  setCode,
  setEmail,
  setMaybeSentEmail,
  signOut,
  verifyMagicCode,
}: Readonly<{
  authentication: Authentication
  code: string
  email: string
  maybeSentEmail: Option.Option<string>
  sendMagicCode: () => void
  setCode: (code: string) => void
  setEmail: (email: string) => void
  setMaybeSentEmail: (email: Option.Option<string>) => void
  signOut: () => void
  verifyMagicCode: () => void
}>) => {
  if (authentication._tag === 'RestoringAuthentication') {
    return (
      <Card>
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#8ae8cf" />
          <Text style={styles.cardDetail}>
            Restoring native authentication…
          </Text>
        </View>
      </Card>
    )
  } else if (authentication._tag === 'SigningOutAuthentication') {
    return (
      <Card>
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#8ae8cf" />
          <Text style={styles.cardDetail}>Closing the Processor…</Text>
        </View>
      </Card>
    )
  } else if (authentication._tag === 'FailedAuthentication') {
    return (
      <Card>
        <Text style={styles.cardTitle}>Authentication unavailable</Text>
        <Text style={styles.errorText}>{authentication.reason}</Text>
      </Card>
    )
  } else if (authentication._tag === 'SignedInAuthentication') {
    const account = Option.getOrElse(
      authentication.maybeEmail,
      () => 'Authenticated subject',
    )
    return (
      <Card>
        <Text style={styles.cardLabel}>ACCOUNT</Text>
        <Text style={styles.accountText} testID="signed-in-account">
          {account}
        </Text>
        <ActionButton
          label="Sign out"
          onPress={signOut}
          testID="sign-out-button"
          tone="quiet"
        />
      </Card>
    )
  } else if (Option.isNone(maybeSentEmail)) {
    return (
      <Card>
        <Text style={styles.cardTitle}>Sign in with email</Text>
        <Text style={styles.cardDetail}>
          Instant will send a one-time magic code. No credential enters the
          counter Model or replay tape.
        </Text>
        <TextInput
          accessibilityLabel="Email address"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor="#65758c"
          style={styles.input}
          testID="email-input"
          value={email}
        />
        <ActionButton
          disabled={email.trim().length === 0}
          label="Send one-time code"
          onPress={sendMagicCode}
          testID="send-code-button"
        />
      </Card>
    )
  } else {
    return (
      <Card>
        <Text style={styles.cardTitle}>Enter your code</Text>
        <Text style={styles.cardDetail}>Sent to {maybeSentEmail.value}</Text>
        <TextInput
          accessibilityLabel="One-time code"
          autoComplete="one-time-code"
          keyboardType="number-pad"
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor="#65758c"
          style={styles.input}
          testID="code-input"
          value={code}
        />
        <ActionButton
          disabled={code.trim().length === 0}
          label="Verify code"
          onPress={verifyMagicCode}
          testID="verify-code-button"
        />
        <ActionButton
          label="Use another email"
          onPress={() => {
            setCode('')
            setMaybeSentEmail(Option.none())
          }}
          testID="change-email-button"
          tone="quiet"
        />
      </Card>
    )
  }
}

const CounterCard = ({
  controller,
  state,
}: Readonly<{
  controller: NativeCounterController
  state: NativeCounterViewState
}>) => (
  <Card>
    <Text style={styles.cardLabel}>DISPLAYED MODEL</Text>
    <Text
      accessibilityLabel={`Counter value ${state.count.toString()}`}
      style={styles.count}
      testID="counter-value"
    >
      {state.count}
    </Text>
    <View style={styles.sequenceRow}>
      <SequenceMetric
        label="Accepted"
        testID="accepted-sequence"
        value={state.acceptedSequence}
      />
      <SequenceMetric
        label="Displayed"
        testID="displayed-sequence"
        value={state.displayedSequence}
      />
      <SequenceMetric
        label="Pending"
        testID="pending-count"
        value={state.pendingCount}
      />
    </View>
    <View style={styles.counterActions}>
      <ActionButton
        disabled={!state.isActionFenceOpen}
        label="−"
        onPress={() => void controller.decrement()}
        testID="decrement-button"
      />
      <ActionButton
        disabled={!state.isActionFenceOpen}
        label="Reset"
        onPress={() => void controller.reset()}
        testID="reset-button"
        tone="quiet"
      />
      <ActionButton
        disabled={!state.isActionFenceOpen}
        label="+"
        onPress={() => void controller.increment()}
        testID="increment-button"
      />
    </View>
  </Card>
)

const ConnectionCard = ({
  controller,
  state,
}: Readonly<{
  controller: NativeCounterController
  state: NativeCounterViewState
}>) => (
  <Card>
    <Text style={styles.cardLabel}>LIVE STATE</Text>
    <StatusRow
      label="Auth"
      testID="auth-state"
      value={authenticationLabel(state.authentication)}
    />
    <StatusRow
      label="Transport"
      testID="transport-state"
      value={state.transportStatus}
    />
    <StatusRow
      label="Connection"
      testID="connection-state"
      value={state.processorConnection}
    />
    <StatusRow
      label="Processor"
      testID="processor-state"
      value={processorLifecycleLabel(state)}
    />
    <View style={styles.connectionActions}>
      <ActionButton
        disabled={!state.isActionFenceOpen}
        label="Disconnect"
        onPress={() => void controller.disconnect()}
        testID="disconnect-button"
        tone="quiet"
      />
      <ActionButton
        disabled={state.processorLifecycle._tag !== 'DisconnectedProcessor'}
        label="Reconnect"
        onPress={() => void controller.reconnect()}
        testID="reconnect-button"
        tone="quiet"
      />
    </View>
  </Card>
)

const Card = ({ children }: Readonly<{ children: ReactNode }>) => (
  <View style={styles.card}>{children}</View>
)

const SequenceMetric = ({
  label,
  testID,
  value,
}: Readonly<{ label: string; testID: string; value: number }>) => (
  <View style={styles.metric}>
    <Text style={styles.metricValue} testID={testID}>
      {value}
    </Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>
)

const StatusRow = ({
  label,
  testID,
  value,
}: Readonly<{ label: string; testID: string; value: string }>) => (
  <View style={styles.statusRow}>
    <Text style={styles.statusLabel}>{label}</Text>
    <Text style={styles.statusValue} testID={testID}>
      {value}
    </Text>
  </View>
)

const ActionButton = ({
  disabled = false,
  label,
  onPress,
  testID,
  tone = 'primary',
}: Readonly<{
  disabled?: boolean
  label: string
  onPress: () => void
  testID: string
  tone?: 'primary' | 'quiet'
}>) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.button,
      tone === 'quiet' ? styles.quietButton : styles.primaryButton,
      pressed ? styles.pressedButton : null,
      disabled ? styles.disabledButton : null,
    ]}
    testID={testID}
  >
    <Text style={tone === 'quiet' ? styles.quietButtonText : styles.buttonText}>
      {label}
    </Text>
  </Pressable>
)

const styles = StyleSheet.create({
  accountText: {
    color: '#f3f8ff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 16,
  },
  button: {
    alignItems: 'center',
    borderRadius: 14,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  buttonText: {
    color: '#05241d',
    fontSize: 16,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#111c2d',
    borderColor: '#25344a',
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
  },
  cardDetail: {
    color: '#aebbd0',
    fontSize: 15,
    lineHeight: 22,
  },
  cardLabel: {
    color: '#78d8c0',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  cardTitle: {
    color: '#f3f8ff',
    fontSize: 22,
    fontWeight: '800',
  },
  connectionActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  count: {
    color: '#ffffff',
    fontSize: 84,
    fontVariant: ['tabular-nums'],
    fontWeight: '200',
    letterSpacing: -5,
    lineHeight: 96,
    textAlign: 'center',
  },
  counterActions: {
    flexDirection: 'row',
    gap: 10,
  },
  disabledButton: {
    opacity: 0.35,
  },
  errorText: {
    color: '#ffb3b8',
    fontSize: 15,
    lineHeight: 22,
  },
  eyebrow: {
    color: '#78d8c0',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  flex: {
    flex: 1,
  },
  hero: {
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  input: {
    backgroundColor: '#0a1321',
    borderColor: '#32435b',
    borderRadius: 14,
    borderWidth: 1,
    color: '#ffffff',
    fontSize: 17,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  metric: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    color: '#7f8da3',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: '#dce8f8',
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  notice: {
    backgroundColor: '#17362f',
    borderColor: '#2c6457',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  noticeText: {
    color: '#c8f6ea',
    fontSize: 14,
    lineHeight: 20,
  },
  pressedButton: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  primaryButton: {
    backgroundColor: '#8ae8cf',
  },
  quietButton: {
    backgroundColor: '#1b293d',
    borderColor: '#354761',
    borderWidth: 1,
  },
  quietButtonText: {
    color: '#d8e4f4',
    fontSize: 15,
    fontWeight: '700',
  },
  safeArea: {
    backgroundColor: '#07101d',
    flex: 1,
  },
  scrollContent: {
    gap: 16,
    padding: 18,
    paddingBottom: 42,
  },
  sequenceRow: {
    backgroundColor: '#0a1321',
    borderRadius: 16,
    flexDirection: 'row',
    paddingVertical: 12,
  },
  statusLabel: {
    color: '#7f8da3',
    fontSize: 14,
  },
  statusRow: {
    alignItems: 'center',
    borderBottomColor: '#243147',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 36,
  },
  statusValue: {
    color: '#e1ebf8',
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    color: '#95a6bd',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 520,
  },
  title: {
    color: '#f7fbff',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
})
