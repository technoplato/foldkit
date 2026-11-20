import { Match, Predicate } from 'effect'

import { type VNode, dedupeMemoizedResult, memoizedVNodes } from '../vdom.js'
import {
  type BoundaryId,
  type BoundaryRegistry,
  type KeyedLazyRenderState,
  type KeyedLazyUsages,
  beginKeyedLazyTracking,
  beginLazyTracking,
  endKeyedLazyTracking,
  endLazyTracking,
  markSeenForLazyHit,
  registerLazyRollback,
  restoreKeyedLazyUsages,
  trackKeyedLazyUsage,
} from './boundary.js'
import {
  type DispatchSync,
  requireBoundary,
  requireDispatch,
} from './runtimeSingleton.js'

const argsEqual = (
  previous: ReadonlyArray<unknown>,
  current: ReadonlyArray<unknown>,
): boolean => {
  if (previous.length !== current.length) {
    return false
  }
  for (let index = 0; index < previous.length; index++) {
    if (previous[index] !== current[index]) {
      return false
    }
  }
  return true
}

type CacheEntry = Readonly<{
  fn: Function
  args: ReadonlyArray<unknown>
  dispatch: DispatchSync
  vnode: VNode | null
  // NOTE: boundaryIds and their call sites captured during the wrapped
  // function's run. On a later cache hit the same entry is replayed via
  // `markSeenForLazyHit` so the duplicate-slotId guard sees memoized
  // siblings even when their `h.submodel` did not run this render.
  trackedBoundaries: ReadonlyMap<BoundaryId, string>
  trackedKeyedUsages: KeyedLazyUsages
}>

const resolveOrCache = <Args extends ReadonlyArray<unknown>>(
  previousEntry: CacheEntry | undefined,
  fn: (...args: Args) => VNode | null,
  args: Args,
  onCache: (entry: CacheEntry | undefined) => void,
): VNode | null => {
  const dispatch = requireDispatch()
  const { registry } = requireBoundary()
  // NOTE: dispatch identity in the cache key matters for the DevTools
  // jumpTo path: a replay render installs `noOpDispatch`, and without
  // this check a subsequent live render could return a vnode whose
  // handlers still reference the noOp.
  if (
    Predicate.isNotUndefined(previousEntry) &&
    previousEntry.fn === fn &&
    previousEntry.dispatch === dispatch &&
    argsEqual(previousEntry.args, args)
  ) {
    markSeenForLazyHit(registry, previousEntry.trackedBoundaries)
    restoreKeyedLazyUsages(registry, previousEntry.trackedKeyedUsages)
    return previousEntry.vnode
  }

  const trackedBoundaries = beginLazyTracking(registry)
  const trackedKeyedUsages = beginKeyedLazyTracking(registry)
  let vnode: VNode | null
  try {
    vnode = fn(...args)
  } finally {
    endKeyedLazyTracking(registry)
    endLazyTracking(registry)
  }
  // NOTE: dedupe the freshly built subtree against the per-render seen set so a
  // const shared inside this view, or across memoized siblings, is cloned even
  // though dedupeSharedVNodes leaves memoized subtrees opaque. Record the result
  // in memoizedVNodes so that top-level pass keeps it opaque on a cache hit.
  const deduped = Predicate.isNotNull(vnode)
    ? dedupeMemoizedResult(vnode, registry.dedupeSeen)
    : null
  if (Predicate.isNotNull(deduped)) {
    memoizedVNodes.add(deduped)
  }
  onCache({
    fn,
    args,
    dispatch,
    vnode: deduped,
    trackedBoundaries,
    trackedKeyedUsages,
  })
  registerLazyRollback(registry, () => {
    onCache(previousEntry)
  })
  return deduped
}

/** Creates a memoization slot for a view function. On each render, if the
 *  function reference, dispatch, and all arguments are referentially equal
 *  (`===`) to the previous call, the cached VNode is returned without
 *  re-running the view function. Snabbdom's `patchVnode` short-circuits when
 *  it sees the same VNode reference, so both VNode construction and subtree
 *  diffing are skipped.
 *
 *  Dispatch is part of the cache key because event handlers in the cached
 *  VNode close over the dispatch active when the VNode was built. Returning
 *  a VNode built under a different dispatch would silently misroute every
 *  event from that subtree.
 *
 *  The cached VNode must be rendered at a single position in the tree.
 *  Snabbdom tracks the real DOM through each VNode's mutable `.elm` field
 *  and assumes one VNode per position. Rendering the same cached VNode at
 *  two positions causes patches to collide and can duplicate or misplace
 *  DOM nodes. If the same content needs to appear in multiple positions,
 *  create one slot per position. */
export const createLazy = (): (<Args extends ReadonlyArray<unknown>>(
  fn: (...args: Args) => VNode | null,
  args: Args,
) => VNode | null) => {
  let cached: CacheEntry | undefined

  return <Args extends ReadonlyArray<unknown>>(
    fn: (...args: Args) => VNode | null,
    args: Args,
  ): VNode | null =>
    resolveOrCache(cached, fn, args, entry => {
      cached = entry
    })
}

/** Retention policy for a keyed view cache. `None` retains every key.
 *  `AbsentFromRender` releases entries unused by a completed render. */
export type KeyedLazyEviction = 'None' | 'AbsentFromRender'

/** Options for {@link createKeyedLazy}. `evict` defaults to `AbsentFromRender`. */
export type KeyedLazyConfig = Readonly<{
  evict?: KeyedLazyEviction
}>

type KeyedLazy = <Args extends ReadonlyArray<unknown>>(
  key: PropertyKey,
  fn: (...args: Args) => VNode | null,
  args: Args,
) => VNode | null

const writeCacheEntry = (
  cache: Map<PropertyKey, CacheEntry>,
  key: PropertyKey,
  entry: CacheEntry | undefined,
): void => {
  if (entry === undefined) {
    cache.delete(key)
  } else {
    cache.set(key, entry)
  }
}

const createRetainingKeyedLazy = (): KeyedLazy => {
  const cache = new Map<PropertyKey, CacheEntry>()

  return (key, fn, args) =>
    resolveOrCache(cache.get(key), fn, args, entry => {
      writeCacheEntry(cache, key, entry)
    })
}

const createEvictingKeyedLazy = (): KeyedLazy => {
  const states = new WeakMap<
    BoundaryRegistry,
    Readonly<{
      cache: Map<PropertyKey, CacheEntry>
      renderState: KeyedLazyRenderState
    }>
  >()

  return (key, fn, args) => {
    const { registry } = requireBoundary()
    const existingState = states.get(registry)
    const cache = existingState?.cache ?? new Map<PropertyKey, CacheEntry>()
    const renderState = existingState?.renderState ?? {
      keys: () => cache.keys(),
      delete: (entryKey: PropertyKey) => {
        cache.delete(entryKey)
      },
      clear: () => {
        cache.clear()
      },
      isEmpty: () => cache.size === 0,
    }

    if (existingState === undefined) {
      states.set(registry, { cache, renderState })
    }

    const vnode = resolveOrCache(cache.get(key), fn, args, entry => {
      writeCacheEntry(cache, key, entry)
    })
    trackKeyedLazyUsage(registry, renderState, key)
    return vnode
  }
}

/** Creates a keyed memoization map for view functions rendered in a loop. Each
 *  key gets its own independent cache slot. On each render, only entries whose
 *  function reference, dispatch, or arguments have changed by reference are
 *  recomputed.
 *
 *  By default (`evict: 'AbsentFromRender'`), entries absent from a completed
 *  render are released automatically (preserving nested entries beneath cached
 *  parents and rolling back cache writes if view construction throws). Each
 *  runtime owns an isolated cache. Pass `{ evict: 'None' }` only for bounded
 *  key sets that must retain entries while absent.
 *
 *  Like `createLazy`, each key's cached VNode must be rendered at a single
 *  position in the tree. If the same item needs to appear in multiple
 *  positions, create one keyed lazy per position. */
export const createKeyedLazy = (config?: KeyedLazyConfig): KeyedLazy => {
  const eviction = config?.evict ?? 'AbsentFromRender'

  return Match.value(eviction).pipe(
    Match.when('None', () => createRetainingKeyedLazy()),
    Match.when('AbsentFromRender', () => createEvictingKeyedLazy()),
    Match.exhaustive,
  )
}
