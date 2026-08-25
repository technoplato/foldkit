import { Data, Match as M, Result } from 'effect'

import { type Navigation } from './model.js'
import {
  navigationTargetToPath,
  navigationToPath,
  pathToNavigationTarget,
} from './route.js'

// LAW
//
// parse(print(x)) == x at the destination level.
// print(parse(print(x))) == print(x): printed URIs are canonical.
// The URI carries the stable address only. Detail presentation ids are
// transient session identities by design (ADR 0003), so a parsed URI
// reconstructs the navigation skeleton, never those ephemeral fields.

/** A URI that no route in this Program claims. */
export class UnparseableUriError extends Data.TaggedError(
  'UnparseableUriError',
)<{ readonly uri: string }> {}

/** A URI whose canonical spelling differs from the one given. */
export class NonCanonicalUriError extends Data.TaggedError(
  'NonCanonicalUriError',
)<{
  readonly uri: string
  readonly canonicalUri: string
}> {}

/** Every failure while projecting a URI back to navigation state. */
export type UriProjectionError = UnparseableUriError | NonCanonicalUriError

/** The addressable part of one Navigation value: everything but session identities. */
export type NavigationSkeleton =
  | { readonly _tag: 'List' }
  | { readonly _tag: 'Detail'; readonly counterId: string }

const skeletonOf = (navigation: Navigation): NavigationSkeleton =>
  M.value(navigation).pipe(
    M.withReturnType<NavigationSkeleton>(),
    M.tagsExhaustive({
      CounterList: () => ({ _tag: 'List' }),
      CounterDetail: ({ counterId }) => ({ _tag: 'Detail', counterId }),
    }),
  )

/** Prints the canonical URI projection of any navigation state. */
export const canonicalNavigationUri = (navigation: Navigation): string =>
  navigationToPath(navigation)

/**
 * Projects a URI back to the addressable navigation skeleton it names.
 * Rejects unclaimed URIs and non-canonical spellings so callers can
 * redirect instead of guessing.
 */
export const navigationFromUri = (
  uri: string,
): Result.Result<NavigationSkeleton, UriProjectionError> => {
  if (!uri.startsWith('/')) {
    return Result.fail(new UnparseableUriError({ uri }))
  }
  const target = pathToNavigationTarget(uri)
  const canonicalUri = navigationTargetToPath(target)
  if (canonicalUri !== uri) {
    return Result.fail(new NonCanonicalUriError({ uri, canonicalUri }))
  }
  return Result.succeed(
    M.value(target).pipe(
      M.withReturnType<NavigationSkeleton>(),
      M.tagsExhaustive({
        CounterListTarget: () => ({ _tag: 'List' }),
        CounterDetailTarget: ({ counterId }) => ({
          _tag: 'Detail',
          counterId,
        }),
        CounterFactTarget: ({ counterId }) => ({
          _tag: 'Detail',
          counterId,
        }),
        DeleteCounterTarget: ({ counterId }) => ({
          _tag: 'Detail',
          counterId,
        }),
      }),
    ),
  )
}

/** True when two navigations address the same screen regardless of identities. */
export const sameAddress = (left: Navigation, right: Navigation): boolean => {
  const leftSkeleton = skeletonOf(left)
  const rightSkeleton = skeletonOf(right)
  if (leftSkeleton._tag !== rightSkeleton._tag) {
    return false
  }
  if (leftSkeleton._tag === 'Detail' && rightSkeleton._tag === 'Detail') {
    return leftSkeleton.counterId === rightSkeleton.counterId
  }
  return true
}
