import {
  Array,
  Effect,
  Exit,
  Layer,
  Option,
  Result,
  Schema as S,
  Scope,
  Stream,
} from 'effect'
import Constants from 'expo-constants'
import * as Crypto from 'expo-crypto'
import { StatusBar } from 'expo-status-bar'
import * as Synchronization from 'foldkit/synchronization'
import {
  type MultipleCountersV3ClientController,
  type MultipleCountersV3ClientSnapshot,
  type MultipleCountersV3DebugEmail,
  MultipleCountersV3DebugLoginIssued,
  type MultipleCountersV3FollowDraft,
  appendMultipleCountersV3PolicyRequest,
  emptyMultipleCountersV3FollowDraft,
  formatMultipleCountersV3SessionChrome,
  isMultipleCountersV3ObserveFollower,
  makeMultipleCountersV3ClientController,
  multipleCountersV3DebugLoginSubjects,
  multipleCountersV3FollowAlignmentExplanation,
  multipleCountersV3FollowMode,
  multipleCountersV3ModeRequestLabel,
  multipleCountersV3SessionChrome,
  multipleCountersV3SessionEpochSeed,
  resolveMultipleCountersV3EnabledActionToken,
  resolveMultipleCountersV3PolicyRequest,
} from 'instant-counter-example/v3-client'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
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

import {
  ensureHostedInstantSession,
  hostedIdentityLayer,
} from '@foldkit/instant'

import { loadStoredAccessToken, requestKnophyAccessToken } from './access'
import { logBuildProvenance } from './buildProvenance'
import { multipleCountersV3NativeDebugLoginUrl } from './debugLogin'
import { nativeDatabase } from './nativeDatabase'
import {
  makeNativeMultipleCountersV3ProcessorConfig,
  nativeCoreDatabase,
} from './processorConfig'
import { MultipleCountersV3NativeProgramScreen } from './programScreen'

const canonicalListDestinationUri = '/counters'
const isDebugLoginEnabled = __DEV__

const instantAppId = (): string => {
  const appId = process.env['EXPO_PUBLIC_INSTANT_APP_ID']
  if (appId === undefined || appId.length === 0) {
    throw new Error(
      'EXPO_PUBLIC_INSTANT_APP_ID is required. Start through the public Instant environment wrapper.',
    )
  }
  return appId
}

const debugLoginUrl = (): string =>
  multipleCountersV3NativeDebugLoginUrl({
    maybeMetroHost: Option.fromNullishOr(Constants.expoConfig?.hostUri),
    originOverride: Option.fromNullishOr(
      process.env['EXPO_PUBLIC_DEBUG_LOGIN_ORIGIN'],
    ),
    platform: Platform.OS,
  })

const requestDebugLogin = (
  email: MultipleCountersV3DebugEmail,
): Promise<typeof MultipleCountersV3DebugLoginIssued.Type> =>
  fetch(debugLoginUrl(), {
    body: JSON.stringify({ email }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }).then(async response => {
    const body: unknown = await response.json()
    if (!response.ok) {
      throw new Error('DebugLoginUnavailable')
    }
    return S.decodeUnknownSync(MultipleCountersV3DebugLoginIssued)(body)
  })

const accountLabel = (
  maybeEmail: string | null | undefined,
  subjectId: string,
): string => Option.getOrElse(Option.fromNullishOr(maybeEmail), () => subjectId)

/** Runs authenticated Instant Multiple Counters through a native Processor. */
export const App = () => {
  const database = useMemo(() => nativeDatabase, [])
  const coreDatabase = useMemo(() => nativeCoreDatabase(database), [database])
  const authentication = database.useAuth()
  const transportStatus = database.useConnectionStatus()
  const [controller, setController] =
    useState<MultipleCountersV3ClientController | null>(null)
  const [snapshot, setSnapshot] =
    useState<MultipleCountersV3ClientSnapshot | null>(null)
  const [followDraft, setFollowDraft] = useState<MultipleCountersV3FollowDraft>(
    emptyMultipleCountersV3FollowDraft(),
  )
  const [maybeNotice, setNotice] = useState(Option.none<string>())
  const [isModeRequestPending, setModeRequestPending] = useState(false)

  useEffect(logBuildProvenance, [])

  useEffect(() => {
    const scope = Effect.runSync(Scope.make())
    const appId = instantAppId()
    let isCancelled = false
    void (async () => {
      const token = await loadStoredAccessToken()
      await Effect.runPromise(
        Effect.scoped(
          Layer.build(
            token === undefined
              ? hostedIdentityLayer(database)
              : hostedIdentityLayer(database, { accessToken: token }),
          ),
        ),
      )
      if (isCancelled) {
        return
      }
      const nextController = await Effect.runPromise(
        makeMultipleCountersV3ClientController({
          policyRequests: {
            append: request =>
              appendMultipleCountersV3PolicyRequest(coreDatabase, request),
            nextPolicyRequestId: () => Crypto.randomUUID(),
            now: Date.now,
            resolve: request =>
              resolveMultipleCountersV3PolicyRequest(coreDatabase, request),
          },
          processorConfig: subjectId =>
            makeNativeMultipleCountersV3ProcessorConfig({
              database: coreDatabase,
              instantAppId: appId,
              sessionEpochSeed: multipleCountersV3SessionEpochSeed,
              subjectId,
            }),
          signOut: () =>
            Effect.promise(() => database.auth.signOut()).pipe(Effect.asVoid),
        }).pipe(Effect.provideService(Scope.Scope, scope)),
      )
      if (isCancelled) {
        return
      }
      setController(nextController)
      void Effect.runPromise(
        Stream.runForEach(nextController.snapshots, nextSnapshot =>
          Effect.sync(() => setSnapshot(nextSnapshot)),
        ).pipe(Effect.provideService(Scope.Scope, scope)),
      )
    })()
    return () => {
      isCancelled = true
      void Effect.runPromise(Scope.close(scope, Exit.void))
    }
  }, [coreDatabase, database])

  useEffect(() => {
    if (controller === null || authentication.user == null) {
      return
    }
    void Effect.runPromise(
      controller
        .reconcileAuthenticatedSubject(Option.some(authentication.user.id))
        .pipe(
          Effect.flatMap(() => controller.open(canonicalListDestinationUri)),
        ),
    )
  }, [authentication.user, controller])

  const requestMode = (mode: Synchronization.Mode) => {
    if (controller === null || isModeRequestPending) {
      return
    }
    setModeRequestPending(true)
    setNotice(
      Option.some(
        `Requesting ${multipleCountersV3ModeRequestLabel(mode)} from the session authority.`,
      ),
    )
    void Effect.runPromise(controller.requestMode(mode)).then(
      resolution => {
        setModeRequestPending(false)
        setNotice(
          Option.some(
            resolution.resolutionState === 'Accepted'
              ? `The authority accepted ${multipleCountersV3ModeRequestLabel(mode)} as policy generation ${resolution.resolvedPolicyGeneration.toString()}.`
              : `The authority rejected ${multipleCountersV3ModeRequestLabel(mode)}: ${resolution.rejectionReason}.`,
          ),
        )
        void Effect.runPromise(controller.readSnapshot).then(setSnapshot)
      },
      () => {
        setModeRequestPending(false)
        setNotice(Option.some('Mode request was not applied.'))
      },
    )
  }

  const performToken = (token: string) => {
    if (controller === null || snapshot === null) {
      return
    }
    const resolved = resolveMultipleCountersV3EnabledActionToken(
      snapshot.model,
      token,
      !isMultipleCountersV3ObserveFollower(snapshot),
    )
    if (Result.isFailure(resolved)) {
      setNotice(Option.some(resolved.failure._tag))
      return
    }
    void Effect.runPromise(controller.perform(resolved.success)).then(() =>
      Effect.runPromise(controller.readSnapshot).then(setSnapshot),
    )
  }

  const signInWithAccess = useCallback(() => {
    void requestKnophyAccessToken().then(
      token => {
        if (token === undefined) {
          return
        }
        void ensureHostedInstantSession(database, { accessToken: token })
      },
      () =>
        setNotice(
          Option.some(
            'Knophy Access did not return a JWT. Check the whoami redirect allowlist.',
          ),
        ),
    )
  }, [database])

  const signInAs = useCallback(
    (email: MultipleCountersV3DebugEmail) => {
      void requestDebugLogin(email).then(
        issued =>
          database.auth.signInWithMagicCode({
            code: issued.code,
            email: issued.email,
          }),
        () =>
          setNotice(
            Option.some(
              'Start the headless authority to mint Alice and Bob codes. Physical devices need FOLDKIT_INSTANT_DEBUG_LOGIN_HOST=0.0.0.0.',
            ),
          ),
      )
    },
    [database],
  )

  if (
    authentication.isLoading ||
    authentication.user == null ||
    snapshot === null
  ) {
    return (
      <Shell>
        <AuthCard
          isFailed={authentication.error !== undefined}
          isLoading={authentication.isLoading}
          maybeNotice={maybeNotice}
          signInAs={signInAs}
          signInWithAccess={signInWithAccess}
        />
      </Shell>
    )
  }

  const chrome = multipleCountersV3SessionChrome(
    snapshot,
    accountLabel(authentication.user.email, authentication.user.id),
  )
  const followerProcessorId =
    followDraft.followerProcessorId.length === 0
      ? chrome.processorId
      : followDraft.followerProcessorId

  return (
    <Shell>
      <View style={styles.card}>
        <Text style={styles.label}>INSTANT SESSION</Text>
        {Array.map(formatMultipleCountersV3SessionChrome(chrome), line => (
          <Text key={line} style={styles.chromeLine}>
            {line}
          </Text>
        ))}
        <StatusRow label="Transport" value={transportStatus} />
        {chrome.isObserveFollower ? (
          <Text style={styles.noticeText}>
            Navigation follows the leader. Domain actions stay available.
          </Text>
        ) : null}
        {Option.isSome(maybeNotice) ? (
          <Text style={styles.noticeText} testID="notice">
            {maybeNotice.value}
          </Text>
        ) : null}
        <Text style={styles.sectionLabel}>Navigation synchronization</Text>
        <View style={styles.rowActions}>
          <ActionButton
            disabled={isModeRequestPending}
            label="Independent"
            onPress={() => requestMode(Synchronization.SharedDomain.make({}))}
            testID="mode-independent"
          />
          <ActionButton
            disabled={isModeRequestPending}
            label="Mirror"
            onPress={() => requestMode(Synchronization.Mirror.make({}))}
            testID="mode-mirror"
            tone="quiet"
          />
        </View>
        <Text style={styles.detail}>
          {multipleCountersV3FollowAlignmentExplanation}
        </Text>
        <TextInput
          accessibilityLabel="Leader Processor id"
          autoCapitalize="none"
          onChangeText={leaderProcessorId =>
            setFollowDraft({ ...followDraft, leaderProcessorId })
          }
          placeholder="Leader Processor id"
          placeholderTextColor="#65758c"
          style={styles.input}
          testID="follow-leader"
          value={followDraft.leaderProcessorId}
        />
        <TextInput
          accessibilityLabel="Follower Processor id"
          autoCapitalize="none"
          onChangeText={nextFollowerProcessorId =>
            setFollowDraft({
              ...followDraft,
              followerProcessorId: nextFollowerProcessorId,
            })
          }
          placeholder="Follower Processor id"
          placeholderTextColor="#65758c"
          style={styles.input}
          testID="follow-follower"
          value={followerProcessorId}
        />
        <View style={styles.rowActions}>
          <ActionButton
            disabled={isModeRequestPending}
            label="Observe"
            onPress={() =>
              setFollowDraft({ ...followDraft, control: 'Observe' })
            }
            testID="follow-observe"
            tone={followDraft.control === 'Observe' ? 'primary' : 'quiet'}
          />
          <ActionButton
            disabled={isModeRequestPending}
            label="Remote control"
            onPress={() =>
              setFollowDraft({ ...followDraft, control: 'RemoteControl' })
            }
            testID="follow-remote"
            tone={followDraft.control === 'RemoteControl' ? 'primary' : 'quiet'}
          />
        </View>
        <ActionButton
          disabled={isModeRequestPending}
          label="Follow"
          onPress={() => {
            const maybeMode = multipleCountersV3FollowMode(
              followDraft.leaderProcessorId,
              followerProcessorId,
              followDraft.control,
            )
            if (Option.isNone(maybeMode)) {
              setNotice(
                Option.some(
                  'Follow needs different non-empty leader and follower Processor ids.',
                ),
              )
              return
            }
            requestMode(maybeMode.value)
          }}
          testID="follow-submit"
        />
        <ActionButton
          label="Sign out"
          onPress={() => {
            if (controller !== null) {
              void Effect.runPromise(controller.signOut)
            }
          }}
          testID="sign-out-button"
          tone="quiet"
        />
      </View>
      <MultipleCountersV3NativeProgramScreen
        isNavigationEnabled={!chrome.isObserveFollower}
        model={snapshot.model}
        onPerform={performToken}
      />
    </Shell>
  )
}

const Shell = ({ children }: Readonly<{ children: ReactNode }>) => (
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
          <Text style={styles.heroTitle}>Multiple counters</Text>
          <Text style={styles.subtitle}>
            Optimistic here. Authenticated and accepted everywhere. Independent,
            Mirror, and Follow are session policy, not Program state.
          </Text>
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>
)

const authStatusCopy = (isFailed: boolean, isLoading: boolean): ReactNode => {
  if (isLoading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator color="#8ae8cf" />
        <Text style={styles.detail}>Restoring native authentication…</Text>
      </View>
    )
  }
  if (isFailed) {
    return (
      <Text style={styles.errorText}>
        Instant could not restore native authentication.
      </Text>
    )
  }
  return (
    <Text style={styles.detail}>
      Sign in with Access, or as Alice or Bob, then switch Independent, Mirror,
      or Follow.
    </Text>
  )
}

const AuthCard = ({
  isFailed,
  isLoading,
  maybeNotice,
  signInAs,
  signInWithAccess,
}: Readonly<{
  isFailed: boolean
  isLoading: boolean
  maybeNotice: Option.Option<string>
  signInAs: (email: MultipleCountersV3DebugEmail) => void
  signInWithAccess: () => void
}>) => (
  <View style={styles.card}>
    <Text style={styles.cardTitle}>Your counters, on every Processor</Text>
    {Option.isSome(maybeNotice) ? (
      <Text style={styles.noticeText} testID="notice">
        {maybeNotice.value}
      </Text>
    ) : null}
    {authStatusCopy(isFailed, isLoading)}
    <ActionButton
      label="Sign in with Access"
      onPress={signInWithAccess}
      testID="access-login"
    />
    {isDebugLoginEnabled
      ? Array.map(multipleCountersV3DebugLoginSubjects, subject => (
          <ActionButton
            key={subject.email}
            label={`Sign in as ${subject.label}`}
            onPress={() => signInAs(subject.email)}
            testID={`debug-login-${subject.label.toLowerCase()}`}
            tone="quiet"
          />
        ))
      : null}
  </View>
)

const StatusRow = ({
  label,
  value,
}: Readonly<{ label: string; value: string }>) => (
  <View style={styles.statusRow}>
    <Text style={styles.statusLabel}>{label}</Text>
    <Text style={styles.statusValue}>{value}</Text>
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
  },
  cardTitle: {
    color: '#f3f8ff',
    fontSize: 22,
    fontWeight: '800',
  },
  chromeLine: {
    color: '#e1ebf8',
    fontSize: 14,
    fontWeight: '600',
  },
  detail: {
    color: '#aebbd0',
    fontSize: 15,
    lineHeight: 22,
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
  heroTitle: {
    color: '#f7fbff',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1.5,
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
  label: {
    color: '#78d8c0',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  noticeText: {
    color: '#c8f6ea',
    fontSize: 14,
    lineHeight: 20,
  },
  pressedButton: {
    opacity: 0.72,
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
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
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
  sectionLabel: {
    color: '#f3f8ff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  statusLabel: {
    color: '#7f8da3',
    fontSize: 14,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  statusValue: {
    color: '#e1ebf8',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  subtitle: {
    color: '#95a6bd',
    fontSize: 16,
    lineHeight: 24,
  },
})
