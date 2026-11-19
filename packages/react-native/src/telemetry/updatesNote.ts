import { Option } from 'effect'

// RUNNING CODE

/**
 * What an updates module says about the code a phone app started on, as
 * far as a trace reads it. Expo's `expo-updates` module has this shape.
 */
export type RunningCode = Readonly<{
  isEnabled: boolean
  updateId: string | null
  isEmbeddedLaunch: boolean
  isEmergencyLaunch: boolean
  runtimeVersion: string | null
  createdAt: Date | null
}>

/**
 * Which code a phone app is running, as a fact for its trace: the code
 * the build carries or an update taken over the air, by its own name,
 * for which native runtime, and when it was made. An app that fell back
 * to its built-in code because an update would not start says so.
 *
 * @example
 * ```typescript
 * import * as Updates from 'expo-updates'
 *
 * attachDevelopmentTelemetry(handle, { app, note: runningCodeOf(Updates) })
 * ```
 */
export const runningCodeOf = (
  running: RunningCode,
): Readonly<Record<string, unknown>> =>
  running.isEnabled
    ? {
        code: {
          updateId: running.updateId,
          isBuiltIn: running.isEmbeddedLaunch,
          runtime: running.runtimeVersion,
          ...(running.createdAt === null
            ? {}
            : { madeAt: running.createdAt.toISOString() }),
          ...(running.isEmergencyLaunch ? { fellBack: true } : {}),
        },
      }
    : { code: { updates: 'off' } }

// ASKING FOR NEWER CODE

/**
 * Where an updates module is in asking its server for newer code, as far
 * as a trace reads it. Expo's native state machine context has this
 * shape.
 */
export type UpdatesCheck = Readonly<{
  isChecking: boolean
  isDownloading: boolean
  isUpdateAvailable: boolean
  isUpdatePending: boolean
  checkError?: Readonly<{ message: string }> | undefined
  downloadError?: Readonly<{ message: string }> | undefined
  downloadedManifest?: Readonly<{ id?: string }> | undefined
  lastCheckForUpdateTime?: Date | undefined
}>

const maximumWhyCharacters = 200

const whyOf = (error: Readonly<{ message: string }>): string =>
  error.message.slice(0, maximumWhyCharacters)

/**
 * What came of asking for newer code, once it is known: none newer,
 * newer code fetched for the next open, or that the server could not be
 * asked or the code not fetched. Not reaching the server is ordinary, as
 * when the phone is off the network the server is on: the app keeps the
 * code it has. None while it is still asking or fetching.
 */
export const updatesOutcomeOf = (
  check: UpdatesCheck,
): Option.Option<Readonly<Record<string, unknown>>> => {
  if (check.isChecking || check.isDownloading) {
    return Option.none()
  } else if (check.isUpdatePending) {
    return Option.some({
      updates: 'fetched; runs from the next open',
      updateId: check.downloadedManifest?.id ?? null,
    })
  } else if (check.downloadError !== undefined) {
    return Option.some({
      updates: 'could not fetch the newer code; keeping the code it has',
      why: whyOf(check.downloadError),
    })
  } else if (check.checkError !== undefined) {
    return Option.some({
      updates: 'could not ask the updates server; keeping the code it has',
      why: whyOf(check.checkError),
    })
  } else if (check.lastCheckForUpdateTime !== undefined) {
    return Option.some({ updates: 'none newer' })
  } else {
    return Option.none()
  }
}

/**
 * Says what came of asking for newer code: what was already known when
 * the watch began, then each change, never the same thing twice running.
 *
 * @example
 * ```typescript
 * import * as Updates from 'expo-updates'
 *
 * attachDevelopmentTelemetry(handle, {
 *   app,
 *   laterNotes: say => {
 *     watchUpdates({
 *       latest: Updates.latestContext,
 *       listen: Updates.addUpdatesStateChangeListener,
 *       say,
 *     })
 *   },
 * })
 * ```
 */
export const watchUpdates = ({
  latest,
  listen,
  say,
}: Readonly<{
  latest: UpdatesCheck
  listen: (
    listener: (event: Readonly<{ context: UpdatesCheck }>) => void,
  ) => unknown
  say: (note: Readonly<Record<string, unknown>>) => void
}>): void => {
  const heard = { last: '' }
  const tell = (check: UpdatesCheck): void => {
    Option.match(updatesOutcomeOf(check), {
      onNone: () => undefined,
      onSome: note => {
        const text = JSON.stringify(note)
        if (text !== heard.last) {
          heard.last = text
          say(note)
        }
      },
    })
  }
  tell(latest)
  listen(event => {
    tell(event.context)
  })
}
