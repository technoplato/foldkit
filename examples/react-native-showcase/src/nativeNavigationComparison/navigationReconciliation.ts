import { Option, Schema as S } from 'effect'

import { NavigationPolicy, ProgramDecision } from './transitionMetrics'

/** A native stack route observed by the always-mounted navigation container. */
export const NativeRoute = S.Literals(['Home', 'Scene'])
/** A native stack route. */
export type NativeRoute = typeof NativeRoute.Type

/** The pending transition facts needed for Model-to-native reconciliation. */
export const PendingNativeTransition = S.Struct({
  maybeDecision: S.Option(ProgramDecision),
  policy: NavigationPolicy,
})
/** Pending native transition facts. */
export type PendingNativeTransition = typeof PendingNativeTransition.Type

/** No native stack reconciliation is needed. */
export const KeptNativeNavigation = S.TaggedStruct('KeptNativeNavigation', {})
/** The accepted pop reached native Home and can release its pending gate. */
export const ReleasedAcceptedNativePop = S.TaggedStruct(
  'ReleasedAcceptedNativePop',
  {},
)
/** The optimistic rejected pop reached native Home and must roll back. */
export const StartedOptimisticNativeRollback = S.TaggedStruct(
  'StartedOptimisticNativeRollback',
  {},
)
/** The Program is Home while the native stack still presents Scene. */
export const PoppedNativeScene = S.TaggedStruct('PoppedNativeScene', {})
/** The Program presents a Scene while the native stack remains at Home. */
export const PushedNativeScene = S.TaggedStruct('PushedNativeScene', {})

/** Every reconciliation selected from Program and native navigation state. */
export const NativeNavigationReconciliation = S.Union([
  KeptNativeNavigation,
  ReleasedAcceptedNativePop,
  StartedOptimisticNativeRollback,
  PoppedNativeScene,
  PushedNativeScene,
])
/** One native navigation reconciliation. */
export type NativeNavigationReconciliation =
  typeof NativeNavigationReconciliation.Type

/** Selects the native action required to restore Program/native agreement. */
export const nativeNavigationReconciliation = ({
  isProgramHome,
  maybePendingTransition,
  nativeRoute,
}: Readonly<{
  isProgramHome: boolean
  maybePendingTransition: Option.Option<PendingNativeTransition>
  nativeRoute: NativeRoute
}>): NativeNavigationReconciliation => {
  if (Option.isSome(maybePendingTransition)) {
    const pendingTransition = maybePendingTransition.value
    if (
      nativeRoute === 'Home' &&
      pendingTransition.policy === 'OptimisticNative' &&
      Option.isSome(pendingTransition.maybeDecision) &&
      pendingTransition.maybeDecision.value === 'Rejected'
    ) {
      return StartedOptimisticNativeRollback.make({})
    } else if (
      nativeRoute === 'Home' &&
      isProgramHome &&
      Option.isSome(pendingTransition.maybeDecision) &&
      pendingTransition.maybeDecision.value === 'Allowed'
    ) {
      return ReleasedAcceptedNativePop.make({})
    }
    return KeptNativeNavigation.make({})
  } else if (nativeRoute === 'Scene' && isProgramHome) {
    return PoppedNativeScene.make({})
  } else if (nativeRoute === 'Home' && !isProgramHome) {
    return PushedNativeScene.make({})
  } else {
    return KeptNativeNavigation.make({})
  }
}
