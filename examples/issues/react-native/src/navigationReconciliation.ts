import { Schema as S } from 'effect'
import { type Navigation } from 'issues-core-example'

/** The two physical stack positions used by the native host. */
export const NativeIssueRoute = S.Literals(['Issues', 'Destination'])
/** One physical native stack position. */
export type NativeIssueRoute = typeof NativeIssueRoute.Type

/** The native stack already agrees with Program navigation. */
export const KeptNativeIssueRoute = S.TaggedStruct('KeptNativeIssueRoute', {})
/** Program navigation requires the native destination screen. */
export const PushedNativeIssueDestination = S.TaggedStruct(
  'PushedNativeIssueDestination',
  {},
)
/** Program navigation requires the native Issue list root. */
export const PoppedNativeIssueDestination = S.TaggedStruct(
  'PoppedNativeIssueDestination',
  {},
)
/** Every native stack reconciliation selected from typed Program state. */
export const NativeIssueReconciliation = S.Union([
  KeptNativeIssueRoute,
  PushedNativeIssueDestination,
  PoppedNativeIssueDestination,
])
/** Every native stack reconciliation selected from typed Program state. */
export type NativeIssueReconciliation = typeof NativeIssueReconciliation.Type

/** Selects the minimum stack action needed to match Program navigation. */
export const nativeIssueReconciliation = (
  navigation: Navigation,
  nativeRoute: NativeIssueRoute,
): NativeIssueReconciliation => {
  const isProgramRoot = navigation._tag === 'IssueList'
  if (isProgramRoot && nativeRoute === 'Destination') {
    return PoppedNativeIssueDestination.make({})
  } else if (!isProgramRoot && nativeRoute === 'Issues') {
    return PushedNativeIssueDestination.make({})
  }
  return KeptNativeIssueRoute.make({})
}
