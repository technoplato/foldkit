import {
  Array,
  Duration,
  Effect,
  Match as M,
  Option,
  Schema as S,
} from 'effect'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import {
  DarkTheme,
  NavigationContainer,
  createNavigationContainerRef,
  useNavigation,
  usePreventRemove,
} from '@react-navigation/native'
import type { NavigationAction } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import {
  NativeRoute,
  PendingNativeTransition,
  nativeNavigationReconciliation,
} from './navigationReconciliation'
import {
  AttemptedNativeBackTransition,
  CancelledNativeBackGesture,
  DecisionDelay,
  NavigationPolicy,
  ObservedNativePopStart,
  ObservedNativeStackStateCommit,
  ObservedProgramModelCommit,
  ObservedPrototypeInjectedProgramDecision,
  ObservedVisualCommit,
  ObservedVisualRollback,
  ObservedVisualRollbackStart,
  ProgramDecision,
  RecordedTransitionObservation,
  SuppressedDuplicateNativeBackTransition,
  type TransitionMetrics,
  type TransitionObservation,
  TransitionPhase,
  initialTransitionMetrics,
  recordTransitionObservation,
} from './transitionMetrics'

const PROGRAM_DECISION_DELAY_MILLISECONDS = 650
const HOME_ROUTE = 'ShowcaseHome'
const SCENE_ROUTE = 'ShowcaseScene'

const NativeStackParamList = S.Struct({
  ShowcaseHome: S.Undefined,
  ShowcaseScene: S.Undefined,
})
type NativeStackParamList = typeof NativeStackParamList.Type

const NativeStack = createNativeStackNavigator<NativeStackParamList>()
const navigationRef = createNavigationContainerRef<NativeStackParamList>()

const nowMilliseconds = (): number => globalThis.performance.now()

const resolvePrototypeInjectedProgramDecision = (
  decision: ProgramDecision,
  decisionDelay: DecisionDelay,
): Effect.Effect<ProgramDecision> =>
  Effect.gen(function* () {
    if (decisionDelay === 'Slow650Milliseconds') {
      yield* Effect.sleep(Duration.millis(PROGRAM_DECISION_DELAY_MILLISECONDS))
    }
    return decision
  })

const roundedElapsedMilliseconds = (startedAt: number): number =>
  Math.round(nowMilliseconds() - startedAt)

const NativeSceneScreen = ({
  children,
  isRemovalAllowed,
  onAttemptedBack,
  policy,
}: Readonly<{
  children: ReactNode
  isRemovalAllowed: boolean
  onAttemptedBack: (action: NavigationAction) => void
  policy: NavigationPolicy
}>) => {
  const navigation = useNavigation()
  usePreventRemove(
    policy === 'StrictProgramFirst' && !isRemovalAllowed,
    ({ data }) => onAttemptedBack(data.action),
  )

  useEffect(() => {
    if (policy !== 'OptimisticNative') {
      return
    }
    return navigation.addListener('beforeRemove', event => {
      onAttemptedBack(event.data.action)
    })
  }, [navigation, onAttemptedBack, policy])

  return <View style={styles.screen}>{children}</View>
}

/** Compares strict Program-first and optimistic native Back transitions. */
export const NativeNavigationComparison = ({
  home,
  isProgramHome,
  onAcceptedBack,
  scene,
}: Readonly<{
  home: ReactNode
  isProgramHome: boolean
  onAcceptedBack: () => void
  scene: ReactNode
}>) => {
  const [isNavigationReady, setNavigationReady] = useState(false)
  const [isRemovalAllowed, setRemovalAllowed] = useState(false)
  const [decisionDelay, setDecisionDelay] = useState(
    DecisionDelay.make('Immediate'),
  )
  const [metrics, setMetrics] = useState(initialTransitionMetrics)
  const [nextDecision, setNextDecision] = useState(
    ProgramDecision.make('Allowed'),
  )
  const [policy, setPolicy] = useState(
    NavigationPolicy.make('StrictProgramFirst'),
  )
  const [transitionPhase, setTransitionPhase] = useState(
    TransitionPhase.make('Idle'),
  )
  const [observationTrace, setObservationTrace] = useState<
    ReadonlyArray<RecordedTransitionObservation>
  >([])
  const hasDispatchedRemoval = useRef(false)
  const isAcceptingTransitionEvents = useRef(false)
  const isMounted = useRef(true)
  const isRollbackInFlight = useRef(false)
  const pendingAction = useRef<NavigationAction | undefined>(undefined)
  const pendingAttemptId = useRef<number | undefined>(undefined)
  const pendingDecision = useRef<ProgramDecision | undefined>(undefined)
  const pendingPolicy = useRef<NavigationPolicy | undefined>(undefined)
  const nativeStackCommittedAt = useRef<number | undefined>(undefined)
  const programModelCommittedAt = useRef<number | undefined>(undefined)
  const transitionAttemptedAt = useRef<number | undefined>(undefined)
  const visualCommittedAt = useRef<number | undefined>(undefined)
  const nextAttemptId = useRef(1)
  const nextObservationSequenceNumber = useRef(1)

  useEffect(
    () => () => {
      isMounted.current = false
    },
    [],
  )

  const recordObservation = useCallback(
    (observation: TransitionObservation): void => {
      setMetrics(currentMetrics =>
        recordTransitionObservation(currentMetrics, observation),
      )
      const sequenceNumber = nextObservationSequenceNumber.current
      nextObservationSequenceNumber.current = sequenceNumber + 1
      setObservationTrace(currentTrace =>
        Array.append(
          currentTrace,
          RecordedTransitionObservation.make({ observation, sequenceNumber }),
        ),
      )
    },
    [],
  )

  const clearPendingTransition = useCallback((): void => {
    hasDispatchedRemoval.current = false
    isAcceptingTransitionEvents.current = false
    isRollbackInFlight.current = false
    pendingAction.current = undefined
    pendingAttemptId.current = undefined
    pendingDecision.current = undefined
    pendingPolicy.current = undefined
    nativeStackCommittedAt.current = undefined
    programModelCommittedAt.current = undefined
    transitionAttemptedAt.current = undefined
    visualCommittedAt.current = undefined
    setRemovalAllowed(false)
    setTransitionPhase(TransitionPhase.make('Idle'))
  }, [])

  const releaseAcceptedNativePop = useCallback((): void => {
    hasDispatchedRemoval.current = false
    isAcceptingTransitionEvents.current = false
    pendingAction.current = undefined
    pendingAttemptId.current = undefined
    setRemovalAllowed(false)
    setTransitionPhase(TransitionPhase.make('Idle'))
  }, [])

  const completeOptimisticAllowedTransition = useCallback((): void => {
    if (
      pendingPolicy.current === 'OptimisticNative' &&
      pendingDecision.current === 'Allowed' &&
      nativeStackCommittedAt.current !== undefined &&
      isProgramHome
    ) {
      if (visualCommittedAt.current !== undefined) {
        clearPendingTransition()
      } else {
        releaseAcceptedNativePop()
      }
    }
  }, [clearPendingTransition, isProgramHome, releaseAcceptedNativePop])

  const startOptimisticRollback = useCallback((): void => {
    if (
      pendingPolicy.current !== 'OptimisticNative' ||
      pendingDecision.current !== 'Rejected' ||
      nativeStackCommittedAt.current === undefined ||
      isRollbackInFlight.current ||
      !navigationRef.isReady()
    ) {
      return
    }
    isRollbackInFlight.current = true
    setTransitionPhase(TransitionPhase.make('RollingBack'))
    navigationRef.navigate(SCENE_ROUTE)
  }, [])

  const decideTransition = useCallback(
    (decision: ProgramDecision): void => {
      const attemptedAt = transitionAttemptedAt.current
      if (attemptedAt === undefined || pendingAttemptId.current === undefined) {
        return
      }
      pendingDecision.current = decision
      recordObservation(
        ObservedPrototypeInjectedProgramDecision.make({
          decision,
          latencyMilliseconds: roundedElapsedMilliseconds(attemptedAt),
        }),
      )

      if (pendingPolicy.current === 'StrictProgramFirst') {
        if (decision === 'Allowed') {
          setTransitionPhase(TransitionPhase.make('AwaitingProgramCommit'))
          onAcceptedBack()
        } else {
          clearPendingTransition()
        }
      } else if (decision === 'Allowed') {
        onAcceptedBack()
        completeOptimisticAllowedTransition()
      } else {
        startOptimisticRollback()
      }
    },
    [
      clearPendingTransition,
      completeOptimisticAllowedTransition,
      onAcceptedBack,
      recordObservation,
      startOptimisticRollback,
    ],
  )

  const attemptBackTransition = useCallback(
    (action: NavigationAction): void => {
      if (pendingAttemptId.current !== undefined) {
        recordObservation(SuppressedDuplicateNativeBackTransition.make({}))
        return
      }

      const attemptId = nextAttemptId.current
      nextAttemptId.current = attemptId + 1
      pendingAction.current = action
      pendingAttemptId.current = attemptId
      pendingPolicy.current = policy
      transitionAttemptedAt.current = nowMilliseconds()
      nativeStackCommittedAt.current = undefined
      visualCommittedAt.current = undefined
      programModelCommittedAt.current = undefined
      setNextDecision(ProgramDecision.make('Allowed'))
      setTransitionPhase(
        TransitionPhase.make(
          policy === 'StrictProgramFirst'
            ? 'AwaitingPrototypeDecision'
            : 'NativePopInFlight',
        ),
      )
      recordObservation(AttemptedNativeBackTransition.make({}))
      isAcceptingTransitionEvents.current = true

      Effect.runPromise(
        resolvePrototypeInjectedProgramDecision(nextDecision, decisionDelay),
      ).then(decision => {
        if (isMounted.current) {
          decideTransition(decision)
        }
      })
    },
    [decideTransition, decisionDelay, nextDecision, policy, recordObservation],
  )

  useEffect(() => {
    const attemptedAt = transitionAttemptedAt.current
    if (
      isProgramHome &&
      pendingDecision.current === 'Allowed' &&
      attemptedAt !== undefined &&
      programModelCommittedAt.current === undefined
    ) {
      programModelCommittedAt.current = nowMilliseconds()
      recordObservation(
        ObservedProgramModelCommit.make({
          latencyMilliseconds: roundedElapsedMilliseconds(attemptedAt),
        }),
      )
    }
    if (
      isProgramHome &&
      pendingPolicy.current === 'StrictProgramFirst' &&
      pendingDecision.current === 'Allowed'
    ) {
      hasDispatchedRemoval.current = false
      setRemovalAllowed(true)
    }
    completeOptimisticAllowedTransition()
  }, [completeOptimisticAllowedTransition, isProgramHome, recordObservation])

  const reconcileNativeNavigation = useCallback((): void => {
    if (!navigationRef.isReady()) {
      return
    }
    const currentRoute = navigationRef.getCurrentRoute()
    if (currentRoute === undefined) {
      return
    }

    const nativeRoute = NativeRoute.make(
      currentRoute.name === HOME_ROUTE ? 'Home' : 'Scene',
    )
    const attemptedAt = transitionAttemptedAt.current
    if (
      nativeRoute === 'Home' &&
      pendingAttemptId.current !== undefined &&
      attemptedAt !== undefined &&
      nativeStackCommittedAt.current === undefined
    ) {
      nativeStackCommittedAt.current = nowMilliseconds()
      recordObservation(
        ObservedNativeStackStateCommit.make({
          latencyMilliseconds: roundedElapsedMilliseconds(attemptedAt),
        }),
      )
    }

    let maybePendingTransition = Option.none<PendingNativeTransition>()
    if (
      pendingAttemptId.current !== undefined &&
      pendingPolicy.current !== undefined
    ) {
      maybePendingTransition = Option.some(
        PendingNativeTransition.make({
          maybeDecision: Option.fromNullishOr(pendingDecision.current),
          policy: pendingPolicy.current,
        }),
      )
    }

    const reconciliation = nativeNavigationReconciliation({
      isProgramHome,
      maybePendingTransition,
      nativeRoute,
    })
    M.value(reconciliation).pipe(
      M.withReturnType<void>(),
      M.tagsExhaustive({
        KeptNativeNavigation: () => {},
        ReleasedAcceptedNativePop: () => releaseAcceptedNativePop(),
        StartedOptimisticNativeRollback: () => startOptimisticRollback(),
        PoppedNativeScene: () => {
          if (policy === 'StrictProgramFirst') {
            hasDispatchedRemoval.current = false
            setRemovalAllowed(true)
          } else {
            navigationRef.goBack()
          }
        },
        PushedNativeScene: () => navigationRef.navigate(SCENE_ROUTE),
      }),
    )
  }, [
    isProgramHome,
    policy,
    recordObservation,
    releaseAcceptedNativePop,
    startOptimisticRollback,
  ])

  useEffect(() => {
    if (isNavigationReady) {
      reconcileNativeNavigation()
    }
  }, [isNavigationReady, reconcileNativeNavigation])

  useEffect(() => {
    if (
      !isRemovalAllowed ||
      hasDispatchedRemoval.current ||
      !navigationRef.isReady()
    ) {
      return
    }
    hasDispatchedRemoval.current = true
    if (
      pendingPolicy.current === 'StrictProgramFirst' &&
      pendingAction.current !== undefined
    ) {
      navigationRef.dispatch(pendingAction.current)
    } else if (isProgramHome) {
      navigationRef.goBack()
    }
  }, [isProgramHome, isRemovalAllowed])

  const observedTransitionStart = useCallback(
    (isClosing: boolean): void => {
      const attemptedAt = transitionAttemptedAt.current
      if (!isAcceptingTransitionEvents.current || attemptedAt === undefined) {
        return
      }
      if (isClosing) {
        recordObservation(
          ObservedNativePopStart.make({
            latencyMilliseconds: roundedElapsedMilliseconds(attemptedAt),
          }),
        )
        setTransitionPhase(TransitionPhase.make('NativePopInFlight'))
      } else if (isRollbackInFlight.current) {
        recordObservation(
          ObservedVisualRollbackStart.make({
            latencyMilliseconds: roundedElapsedMilliseconds(attemptedAt),
          }),
        )
        setTransitionPhase(TransitionPhase.make('RollingBack'))
      }
    },
    [recordObservation],
  )

  const observedTransitionEnd = useCallback(
    (isClosing: boolean): void => {
      const attemptedAt = transitionAttemptedAt.current
      if (!isAcceptingTransitionEvents.current) {
        return
      }
      if (isClosing) {
        if (
          attemptedAt !== undefined &&
          visualCommittedAt.current === undefined
        ) {
          visualCommittedAt.current = nowMilliseconds()
          recordObservation(
            ObservedVisualCommit.make({
              latencyMilliseconds: roundedElapsedMilliseconds(attemptedAt),
            }),
          )
        }
        if (pendingPolicy.current === 'StrictProgramFirst') {
          clearPendingTransition()
        } else if (pendingDecision.current === 'Rejected') {
          startOptimisticRollback()
        } else if (pendingDecision.current === 'Allowed') {
          completeOptimisticAllowedTransition()
        }
        if (pendingAttemptId.current === undefined) {
          hasDispatchedRemoval.current = false
          setRemovalAllowed(false)
        }
      } else if (isRollbackInFlight.current && attemptedAt !== undefined) {
        recordObservation(
          ObservedVisualRollback.make({
            latencyMilliseconds: roundedElapsedMilliseconds(attemptedAt),
          }),
        )
        clearPendingTransition()
      }
    },
    [
      clearPendingTransition,
      completeOptimisticAllowedTransition,
      recordObservation,
      startOptimisticRollback,
    ],
  )

  const observedGestureCancel = useCallback((): void => {
    if (!isAcceptingTransitionEvents.current) {
      return
    }
    recordObservation(CancelledNativeBackGesture.make({}))
  }, [recordObservation])

  const isTransitionPending = pendingAttemptId.current !== undefined

  return (
    <SafeAreaProvider>
      <NavigationContainer
        onReady={() => setNavigationReady(true)}
        onStateChange={reconcileNativeNavigation}
        ref={navigationRef}
        theme={DarkTheme}
      >
        <NativeStack.Navigator
          initialRouteName={isProgramHome ? HOME_ROUTE : SCENE_ROUTE}
          screenListeners={({ route }) => ({
            gestureCancel: () => {
              if (route.name === SCENE_ROUTE) {
                observedGestureCancel()
              }
            },
            transitionEnd: event => {
              if (route.name === SCENE_ROUTE) {
                observedTransitionEnd(event.data.closing)
              }
            },
            transitionStart: event => {
              if (route.name === SCENE_ROUTE) {
                observedTransitionStart(event.data.closing)
              }
            },
          })}
          screenOptions={{
            animation: 'slide_from_right',
            contentStyle: styles.navigatorContent,
            headerBackButtonMenuEnabled: false,
            headerStyle: styles.nativeHeader,
            headerTintColor: '#fafafa',
          }}
        >
          <NativeStack.Screen
            name={HOME_ROUTE}
            options={{ title: 'Foldkit Showcase' }}
          >
            {() => <View style={styles.screen}>{home}</View>}
          </NativeStack.Screen>
          <NativeStack.Screen
            name={SCENE_ROUTE}
            options={{ title: 'Program Scene' }}
          >
            {() => (
              <NativeSceneScreen
                isRemovalAllowed={isRemovalAllowed}
                onAttemptedBack={attemptBackTransition}
                policy={policy}
              >
                <TransitionComparisonPanel
                  isTransitionPending={isTransitionPending}
                  decisionDelay={decisionDelay}
                  metrics={metrics}
                  nextDecision={nextDecision}
                  observationTrace={observationTrace}
                  onResetMetrics={() => {
                    nextObservationSequenceNumber.current = 1
                    setMetrics(initialTransitionMetrics)
                    setObservationTrace([])
                  }}
                  onSelectedDecisionDelay={nextDecisionDelay => {
                    nextObservationSequenceNumber.current = 1
                    setDecisionDelay(nextDecisionDelay)
                    setMetrics(initialTransitionMetrics)
                    setObservationTrace([])
                  }}
                  onSelectedDecision={setNextDecision}
                  onSelectedPolicy={nextPolicy => {
                    nextObservationSequenceNumber.current = 1
                    setPolicy(nextPolicy)
                    setMetrics(initialTransitionMetrics)
                    setObservationTrace([])
                  }}
                  policy={policy}
                  transitionPhase={transitionPhase}
                />
                <View style={styles.sceneContent}>{scene}</View>
              </NativeSceneScreen>
            )}
          </NativeStack.Screen>
        </NativeStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}

const formatLatency = (maybeLatency: Option.Option<number>): string => {
  if (Option.isSome(maybeLatency)) {
    return `${maybeLatency.value.toString()} ms`
  }
  return 'Not measured'
}

const TransitionComparisonPanel = ({
  decisionDelay,
  isTransitionPending,
  metrics,
  nextDecision,
  observationTrace,
  onResetMetrics,
  onSelectedDecisionDelay,
  onSelectedDecision,
  onSelectedPolicy,
  policy,
  transitionPhase,
}: Readonly<{
  decisionDelay: DecisionDelay
  isTransitionPending: boolean
  metrics: TransitionMetrics
  nextDecision: ProgramDecision
  observationTrace: ReadonlyArray<RecordedTransitionObservation>
  onResetMetrics: () => void
  onSelectedDecisionDelay: (decisionDelay: DecisionDelay) => void
  onSelectedDecision: (decision: ProgramDecision) => void
  onSelectedPolicy: (policy: NavigationPolicy) => void
  policy: NavigationPolicy
  transitionPhase: TransitionPhase
}>) => {
  const policyExplanation = M.value(policy).pipe(
    M.withReturnType<string>(),
    M.when(
      'StrictProgramFirst',
      () =>
        'The native pop waits until the Showcase Program reaches HomeScene.',
    ),
    M.when(
      'OptimisticNative',
      () =>
        'The native pop commits first. A rejection visibly pushes this scene back.',
    ),
    M.exhaustive,
  )

  return (
    <ScrollView
      contentContainerStyle={styles.comparisonPanelContent}
      style={styles.comparisonPanel}
    >
      <View style={styles.panelHeading}>
        <View style={styles.panelHeadingCopy}>
          <Text style={styles.panelTitle}>Native Back comparison</Text>
          <Text style={styles.panelDescription}>{policyExplanation}</Text>
        </View>
        <Text style={styles.phase}>{transitionPhase}</Text>
      </View>
      <View style={styles.controlRow}>
        <ComparisonButton
          disabled={isTransitionPending}
          isSelected={policy === 'StrictProgramFirst'}
          label="Strict Program-first"
          onPress={() =>
            onSelectedPolicy(NavigationPolicy.make('StrictProgramFirst'))
          }
        />
        <ComparisonButton
          disabled={isTransitionPending}
          isSelected={policy === 'OptimisticNative'}
          label="Optimistic native"
          onPress={() =>
            onSelectedPolicy(NavigationPolicy.make('OptimisticNative'))
          }
        />
      </View>
      <View style={styles.controlRow}>
        <ComparisonButton
          disabled={isTransitionPending}
          isSelected={decisionDelay === 'Immediate'}
          label="Immediate gate (0 ms)"
          onPress={() =>
            onSelectedDecisionDelay(DecisionDelay.make('Immediate'))
          }
        />
        <ComparisonButton
          disabled={isTransitionPending}
          isSelected={decisionDelay === 'Slow650Milliseconds'}
          label="Slow gate (650 ms)"
          onPress={() =>
            onSelectedDecisionDelay(DecisionDelay.make('Slow650Milliseconds'))
          }
        />
      </View>
      <Text style={styles.experimentalLabel}>
        Prototype-injected decision gate. Rejection never enters the portable
        Showcase Program.
      </Text>
      <View style={styles.controlRow}>
        <ComparisonButton
          disabled={isTransitionPending}
          isSelected={nextDecision === 'Allowed'}
          label="Allow next Back"
          onPress={() => onSelectedDecision(ProgramDecision.make('Allowed'))}
        />
        <ComparisonButton
          disabled={isTransitionPending}
          isSelected={nextDecision === 'Rejected'}
          label="Reject next Back"
          onPress={() => onSelectedDecision(ProgramDecision.make('Rejected'))}
        />
      </View>
      <View style={styles.metricsGrid}>
        <Metric
          label="Attempts"
          value={metrics.attemptedTransitions.toString()}
        />
        <Metric
          label="Injected decision gate: Back interception → gate resolution"
          value={formatLatency(
            metrics.maybePrototypeInjectedProgramDecisionLatencyMilliseconds,
          )}
        />
        <Metric
          label="Program Model commit: Back interception → HomeScene observed"
          value={formatLatency(
            metrics.maybeProgramModelCommitLatencyMilliseconds,
          )}
        />
        <Metric
          label="Native pop start: Back interception → transitionStart(closing)"
          value={formatLatency(metrics.maybeNativePopStartLatencyMilliseconds)}
        />
        <Metric
          label="Native stack commit: Back interception → container Home state"
          value={formatLatency(
            metrics.maybeNativeStackStateCommitLatencyMilliseconds,
          )}
        />
        <Metric
          label="Rollback start: Back interception → transitionStart(opening)"
          value={formatLatency(
            metrics.maybeVisualRollbackStartLatencyMilliseconds,
          )}
        />
        <Metric
          label="Visual commits"
          value={metrics.visualCommits.toString()}
        />
        <Metric
          label="Visual commit: Back interception → transitionEnd(closing)"
          value={formatLatency(metrics.maybeVisualCommitLatencyMilliseconds)}
        />
        <Metric
          label="Visual rollbacks"
          value={metrics.visualRollbacks.toString()}
        />
        <Metric
          label="Visual rollback: Back interception → transitionEnd(opening)"
          value={formatLatency(metrics.maybeVisualRollbackLatencyMilliseconds)}
        />
        <Metric
          label="Native gestureCancel events"
          value={metrics.canceledGestures.toString()}
        />
        <Metric
          label="Duplicates suppressed"
          value={metrics.duplicateTransitionsSuppressed.toString()}
        />
      </View>
      <View style={styles.trace}>
        <Text style={styles.traceTitle}>Ordered raw observation trace</Text>
        {Array.match(observationTrace, {
          onEmpty: () => (
            <Text style={styles.traceEmpty}>No Back observations yet.</Text>
          ),
          onNonEmpty: observations =>
            Array.map(observations, ({ observation, sequenceNumber }) => (
              <Text key={sequenceNumber} style={styles.traceEvent}>
                #{sequenceNumber.toString()} {formatObservation(observation)}
              </Text>
            )),
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={isTransitionPending}
        onPress={onResetMetrics}
        style={styles.resetMetricsButton}
      >
        <Text style={styles.resetMetricsButtonText}>Reset metrics</Text>
      </Pressable>
    </ScrollView>
  )
}

const formatObservation = (observation: TransitionObservation): string =>
  M.value(observation).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      AttemptedNativeBackTransition: () => 'AttemptedNativeBackTransition',
      ObservedPrototypeInjectedProgramDecision: ({
        decision,
        latencyMilliseconds,
      }) =>
        `ObservedPrototypeInjectedProgramDecision(${decision}, ${latencyMilliseconds.toString()} ms)`,
      ObservedProgramModelCommit: ({ latencyMilliseconds }) =>
        `ObservedProgramModelCommit(${latencyMilliseconds.toString()} ms)`,
      ObservedNativePopStart: ({ latencyMilliseconds }) =>
        `ObservedNativePopStart(${latencyMilliseconds.toString()} ms)`,
      ObservedNativeStackStateCommit: ({ latencyMilliseconds }) =>
        `ObservedNativeStackStateCommit(${latencyMilliseconds.toString()} ms)`,
      ObservedVisualCommit: ({ latencyMilliseconds }) =>
        `ObservedVisualCommit(${latencyMilliseconds.toString()} ms)`,
      ObservedVisualRollback: ({ latencyMilliseconds }) =>
        `ObservedVisualRollback(${latencyMilliseconds.toString()} ms)`,
      ObservedVisualRollbackStart: ({ latencyMilliseconds }) =>
        `ObservedVisualRollbackStart(${latencyMilliseconds.toString()} ms)`,
      CancelledNativeBackGesture: () => 'CancelledNativeBackGesture',
      SuppressedDuplicateNativeBackTransition: () =>
        'SuppressedDuplicateNativeBackTransition',
    }),
  )

const ComparisonButton = ({
  disabled,
  isSelected,
  label,
  onPress,
}: Readonly<{
  disabled: boolean
  isSelected: boolean
  label: string
  onPress: () => void
}>) => (
  <Pressable
    accessibilityRole="button"
    disabled={disabled}
    onPress={onPress}
    style={isSelected ? styles.selectedControl : styles.control}
  >
    <Text style={isSelected ? styles.selectedControlText : styles.controlText}>
      {label}
    </Text>
  </Pressable>
)

const Metric = ({
  label,
  value,
}: Readonly<{ label: string; value: string }>) => (
  <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
)

const styles = StyleSheet.create({
  navigatorContent: { backgroundColor: '#09090b' },
  nativeHeader: { backgroundColor: '#18181b' },
  screen: { backgroundColor: '#09090b', flex: 1 },
  sceneContent: { flex: 1 },
  comparisonPanel: {
    backgroundColor: '#172554',
    borderBottomColor: '#38bdf8',
    borderBottomWidth: 1,
    maxHeight: 360,
  },
  comparisonPanelContent: {
    gap: 10,
    padding: 14,
  },
  panelHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  panelHeadingCopy: { flex: 1, gap: 4 },
  panelTitle: { color: '#e0f2fe', fontSize: 16, fontWeight: '800' },
  panelDescription: { color: '#bae6fd', fontSize: 12, lineHeight: 17 },
  phase: {
    backgroundColor: '#0c4a6e',
    borderRadius: 99,
    color: '#e0f2fe',
    fontSize: 10,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  experimentalLabel: { color: '#bae6fd', fontSize: 11, lineHeight: 15 },
  controlRow: { flexDirection: 'row', gap: 8 },
  control: {
    backgroundColor: '#0f172a',
    borderColor: '#475569',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectedControl: {
    backgroundColor: '#38bdf8',
    borderColor: '#7dd3fc',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  controlText: { color: '#cbd5e1', fontSize: 11, fontWeight: '700' },
  selectedControlText: { color: '#082f49', fontSize: 11, fontWeight: '800' },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metric: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    flexBasis: '48%',
    flexGrow: 1,
    gap: 2,
    padding: 8,
  },
  metricLabel: { color: '#94a3b8', fontSize: 9, textTransform: 'uppercase' },
  metricValue: { color: '#f8fafc', fontSize: 12, fontWeight: '700' },
  trace: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    gap: 3,
    padding: 8,
  },
  traceTitle: { color: '#e0f2fe', fontSize: 10, fontWeight: '800' },
  traceEmpty: { color: '#64748b', fontSize: 10 },
  traceEvent: { color: '#bae6fd', fontFamily: 'monospace', fontSize: 9 },
  resetMetricsButton: { alignSelf: 'flex-start', paddingVertical: 3 },
  resetMetricsButtonText: {
    color: '#7dd3fc',
    fontSize: 11,
    fontWeight: '700',
  },
})
