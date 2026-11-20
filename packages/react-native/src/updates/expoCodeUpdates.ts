import { Effect, Layer, Option, Queue, Stream } from 'effect'
import {
  Asking,
  BuiltIn,
  type CodeStatus,
  CodeUpdates,
  CouldNotAsk,
  CouldNotFetch,
  FellBack,
  Fetching,
  Found,
  type NewerCode,
  NoneNewer,
  NotAsked,
  Ready,
  RestartRefused,
  type RunningCode,
  Update,
} from 'foldkit/code-updates'

// EXPO

/**
 * What an updates module says about the code a phone app started on.
 * Expo's `expo-updates` module has this shape.
 *
 * @example
 * ```typescript
 * import * as Updates from 'expo-updates'
 *
 * const running: ExpoRunningCode = Updates
 * ```
 */
export type ExpoRunningCode = Readonly<{
  isEnabled: boolean
  updateId: string | null
  isEmbeddedLaunch: boolean
  isEmergencyLaunch: boolean
  runtimeVersion: string | null
  createdAt: Date | null
}>

type ExpoManifest = Readonly<{ id?: string }> | null | undefined

type ExpoError = Readonly<{ message: string }> | null | undefined

/**
 * Where an updates module is in asking its server for newer code. Expo's
 * native state machine context has this shape.
 *
 * @example
 * ```typescript
 * import * as Updates from 'expo-updates'
 *
 * const check: ExpoUpdatesCheck = Updates.latestContext
 * ```
 */
export type ExpoUpdatesCheck = Readonly<{
  isChecking: boolean
  isDownloading: boolean
  isUpdateAvailable: boolean
  isUpdatePending: boolean
  // NOTE: where the module has nothing to say it may say null.
  checkError?: ExpoError
  downloadError?: ExpoError
  latestManifest?: ExpoManifest
  downloadedManifest?: ExpoManifest
  lastCheckForUpdateTime?: Date | null | undefined
}>

/**
 * The part of Expo's `expo-updates` module a Program's code updates are
 * read from: the code it started on, where it stands in asking for newer
 * code and each change to that, and its restart. Pass the module itself.
 *
 * @example
 * ```typescript
 * import * as Updates from 'expo-updates'
 *
 * const updates: ExpoUpdates = Updates
 * ```
 */
export type ExpoUpdates = ExpoRunningCode &
  Readonly<{
    latestContext: ExpoUpdatesCheck
    addUpdatesStateChangeListener: (
      listener: (event: Readonly<{ context: ExpoUpdatesCheck }>) => void,
    ) => Readonly<{ remove: () => void }>
    reloadAsync: () => Promise<void>
  }>

// RUNNING CODE

/**
 * Which code an Expo app is running, as Foldkit reads it: the code the
 * build carries, an update taken over the air, or the built-in code it
 * fell back to because an update would not start. None when updates are
 * off, as in a development build, where the code comes from the
 * development server and no update is taken.
 *
 * @example
 * ```typescript
 * import * as Updates from 'expo-updates'
 *
 * runningCodeOfExpo(Updates)
 * // Some(Update({ maybeUpdateId: Some('1a2b3c4d-…'), maybeRuntime: Some('1.0.0'), maybeMadeAtMs: Some(1795203420000) }))
 * ```
 */
export const runningCodeOfExpo = (
  running: ExpoRunningCode,
): Option.Option<RunningCode> => {
  const code = {
    maybeUpdateId: Option.fromNullishOr(running.updateId),
    maybeRuntime: Option.fromNullishOr(running.runtimeVersion),
    maybeMadeAtMs: Option.map(
      Option.fromNullishOr(running.createdAt),
      createdAt => createdAt.getTime(),
    ),
  }
  if (!running.isEnabled) {
    return Option.none()
  } else if (running.isEmergencyLaunch) {
    return Option.some(FellBack(code))
  } else if (running.isEmbeddedLaunch) {
    return Option.some(BuiltIn(code))
  } else {
    return Option.some(Update(code))
  }
}

// NEWER CODE

const maximumWhyCharacters = 200

const whyOf = (error: Readonly<{ message: string }>): string =>
  error.message.slice(0, maximumWhyCharacters)

const idOf = (manifest: ExpoManifest): Option.Option<string> =>
  Option.fromNullishOr(manifest?.id)

/**
 * Where an Expo app is in asking for newer code, as Foldkit reads it. It
 * is the one reading of Expo's state: the Program's status and the
 * trace's notes both come from it. While the module is asking or
 * fetching, that is what it says, whatever it found before.
 *
 * @example
 * ```typescript
 * import * as Updates from 'expo-updates'
 *
 * newerCodeOfExpo(Updates.latestContext)
 * // Ready({ maybeUpdateId: Some('9f8e7d6c-…') }) once an update is fetched
 * ```
 */
export const newerCodeOfExpo = (check: ExpoUpdatesCheck): NewerCode => {
  const maybeDownloadError = Option.fromNullishOr(check.downloadError)
  const maybeCheckError = Option.fromNullishOr(check.checkError)
  if (check.isChecking) {
    return Asking()
  } else if (check.isDownloading) {
    return Fetching()
  } else if (check.isUpdatePending) {
    return Ready({ maybeUpdateId: idOf(check.downloadedManifest) })
  } else if (Option.isSome(maybeDownloadError)) {
    return CouldNotFetch({ why: whyOf(maybeDownloadError.value) })
  } else if (Option.isSome(maybeCheckError)) {
    return CouldNotAsk({ why: whyOf(maybeCheckError.value) })
  } else if (check.isUpdateAvailable) {
    return Found({ maybeUpdateId: idOf(check.latestManifest) })
  } else if (
    Option.isSome(Option.fromNullishOr(check.lastCheckForUpdateTime))
  ) {
    return NoneNewer()
  } else {
    return NotAsked()
  }
}

// SERVICE

const statusesOf = (updates: ExpoUpdates): Stream.Stream<CodeStatus> =>
  Option.match(runningCodeOfExpo(updates), {
    onNone: () => Stream.empty,
    onSome: running =>
      Stream.changes(
        Stream.callback<CodeStatus>(queue =>
          Effect.acquireRelease(
            Effect.sync(() => {
              Queue.offerUnsafe(queue, {
                running,
                newer: newerCodeOfExpo(updates.latestContext),
              })
              return updates.addUpdatesStateChangeListener(event => {
                Queue.offerUnsafe(queue, {
                  running,
                  newer: newerCodeOfExpo(event.context),
                })
              })
            }),
            subscription =>
              Effect.sync(() => {
                subscription.remove()
              }),
          ),
        ),
      ),
  })

const reasonOf = (error: unknown): string =>
  error instanceof Error ? whyOf(error) : 'the app could not restart'

/**
 * A phone app's code updates, read from Expo's `expo-updates` module: the
 * update it runs and when that was made, where it stands in asking for a
 * newer one, then each change, and a restart on the update it fetched.
 * This host adapter is the only code in a React Native Client that asks
 * the updates module; it hands the answers to the Program as the fact
 * `ObservedCodeStatus`. With updates off it says nothing, so the Program
 * shows nothing about updates.
 *
 * @example
 * ```typescript
 * import * as Updates from 'expo-updates'
 *
 * Layer.mergeAll(resources, expoCodeUpdates(Updates))
 * ```
 */
export const expoCodeUpdates = (updates: ExpoUpdates): Layer.Layer<never> =>
  Layer.succeed(CodeUpdates, {
    statuses: statusesOf(updates),
    restart: Effect.tryPromise({
      try: () => updates.reloadAsync(),
      catch: error => new RestartRefused({ reason: reasonOf(error) }),
    }),
  })
