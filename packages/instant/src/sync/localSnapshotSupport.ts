import { Effect, Option } from 'effect'
import { Runtime } from 'foldkit'

import {
  type PinnedOwnerController,
  type ProgramLogOwner,
} from '../programLog/core.js'
import { type InstantOptions, instantRoomOf } from './fromTransport.js'

const hashSegment = (text: string): string => {
  let first = 2166136261
  let second = 3735928559
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    first = Math.imul(first ^ code, 16777619) >>> 0
    second = Math.imul(second ^ (code + index), 16777619) >>> 0
  }
  return `${first.toString(36)}-${second.toString(36)}`
}

/**
 * Collision-resistant storage key derived from a `LocalSnapshotScope`.
 * The full structured scope is also stamped inside the serialized envelope
 * and checked on decode, so even hash collisions never cross scopes.
 */
export const storageKeyOfScope = (scope: Runtime.LocalSnapshotScope): string =>
  `foldkit-v3-${hashSegment(JSON.stringify(scope))}`

/**
 * Wraps a `LocalSnapshotStore` so `save` refuses to write once the pinned
 * owner has signed out or switched (closing idle-tab and scope-finalizer
 * re-save races).
 */
export const guardStoreWithOwnerPin = (
  store: Runtime.LocalSnapshotStore,
  pinnedOwner: PinnedOwnerController,
): Runtime.LocalSnapshotStore => ({
  load: store.load,
  save: text =>
    Effect.tryPromise(() => pinnedOwner.isPinnedForSave()).pipe(
      Effect.flatMap(isStillPinned =>
        isStillPinned ? store.save(text) : Effect.void,
      ),
    ),
  ...(store.remove === undefined ? {} : { remove: store.remove }),
})

const logIdOf = (options: InstantOptions): string =>
  options.programLog !== undefined
    ? `program:${options.programLog}`
    : `count:${options.countId ?? 'default'}`

/**
 * Resolves the `LocalSnapshotScope` for an Instant engine after sign-in.
 * For `SignedInUser` logs, returns `None` if no member is signed in so no
 * cache is loaded or written without an owner.
 */
export const resolveInstantSnapshotScope = (
  options: InstantOptions,
  processor: string,
  owner: ProgramLogOwner,
  pinnedOwner: PinnedOwnerController,
): Effect.Effect<Option.Option<Runtime.LocalSnapshotScope>, unknown> =>
  Effect.tryPromise(async () => {
    const base = {
      app: options.app.id,
      log: logIdOf(options),
      room: instantRoomOf(processor),
    }
    if (owner === 'Anyone') {
      return Option.some({ ...base, owner: 'anyone' })
    }
    const maybeOwnerId = await pinnedOwner.resolvePinnedOwner()
    return Option.map(maybeOwnerId, ownerId => ({ ...base, owner: ownerId }))
  })

/**
 * Builds the `localSnapshot`, `snapshotScope`, and `watchAuthChanged` hooks
 * for an Instant engine given a platform-specific store factory.
 */
export const makeInstantLocalSnapshotHooks = (
  options: InstantOptions,
  processor: string,
  owner: ProgramLogOwner,
  pinnedOwner: PinnedOwnerController,
  makeStore: (
    scope: Runtime.LocalSnapshotScope,
  ) => Option.Option<Runtime.LocalSnapshotStore>,
): Readonly<{
  snapshotScope: NonNullable<Runtime.SyncEngine['snapshotScope']>
  localSnapshot: NonNullable<Runtime.SyncEngine['localSnapshot']>
  watchAuthChanged: NonNullable<Runtime.SyncEngine['watchAuthChanged']>
}> => {
  const snapshotScope = resolveInstantSnapshotScope(
    options,
    processor,
    owner,
    pinnedOwner,
  )
  const localSnapshot = snapshotScope.pipe(
    Effect.map(
      Option.flatMap(scope =>
        Option.map(makeStore(scope), store =>
          owner === 'SignedInUser'
            ? guardStoreWithOwnerPin(store, pinnedOwner)
            : store,
        ),
      ),
    ),
  )
  return {
    snapshotScope,
    localSnapshot,
    watchAuthChanged: pinnedOwner.watchAuthChanged,
  }
}
