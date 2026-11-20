import { Match as M, Option } from 'effect'
import type { NewerCode, RunningCode } from 'foldkit/code-updates'

import {
  type ExpoRunningCode,
  type ExpoUpdatesCheck,
  newerCodeOfExpo,
  runningCodeOfExpo,
} from '../updates/expoCodeUpdates.js'

type Note = Readonly<Record<string, unknown>>

// RUNNING CODE

const runningNoteOf = (running: RunningCode): Note => ({
  code: {
    updateId: Option.getOrNull(running.maybeUpdateId),
    isBuiltIn: running._tag !== 'Update',
    runtime: Option.getOrNull(running.maybeRuntime),
    ...Option.match(running.maybeMadeAtMs, {
      onNone: () => ({}),
      onSome: madeAtMs => ({ madeAt: new Date(madeAtMs).toISOString() }),
    }),
    ...(running._tag === 'FellBack' ? { fellBack: true } : {}),
  },
})

/**
 * Which code a phone app is running, as a fact for its trace: the code
 * the build carries or an update taken over the air, by its own name,
 * for which native runtime, and when it was made. An app that fell back
 * to its built-in code because an update would not start says so. It is
 * read from the same fact a Program is told, `runningCodeOfExpo`.
 *
 * @example
 * ```typescript
 * import * as Updates from 'expo-updates'
 *
 * attachDevelopmentTelemetry(handle, { app, note: runningCodeOf(Updates) })
 * ```
 */
export const runningCodeOf = (running: ExpoRunningCode): Note =>
  Option.match(runningCodeOfExpo(running), {
    onNone: () => ({ code: { updates: 'off' } }),
    onSome: runningNoteOf,
  })

// ASKING FOR NEWER CODE

const outcomeNoteOf = (newer: NewerCode): Option.Option<Note> =>
  M.value(newer).pipe(
    M.withReturnType<Option.Option<Note>>(),
    M.tagsExhaustive({
      NotAsked: () => Option.none(),
      Asking: () => Option.none(),
      Found: () => Option.none(),
      Fetching: () => Option.none(),
      NoneNewer: () => Option.some({ updates: 'none newer' }),
      Ready: ({ maybeUpdateId }) =>
        Option.some({
          updates: 'fetched; runs from the next open',
          updateId: Option.getOrNull(maybeUpdateId),
        }),
      CouldNotFetch: ({ why }) =>
        Option.some({
          updates: 'could not fetch the newer code; keeping the code it has',
          why,
        }),
      CouldNotAsk: ({ why }) =>
        Option.some({
          updates: 'could not ask the updates server; keeping the code it has',
          why,
        }),
    }),
  )

/**
 * What came of asking for newer code, once it is known: none newer,
 * newer code fetched for the next open, or that the server could not be
 * asked or the code not fetched. Not reaching the server is ordinary, as
 * when the phone is off the network the server is on: the app keeps the
 * code it has. None while it is still asking or fetching, and while newer
 * code is found and not yet fetched. It is read from the same fact a
 * Program is told, `newerCodeOfExpo`.
 *
 * @example
 * ```typescript
 * updatesOutcomeOf(Updates.latestContext) // Some({ updates: 'none newer' })
 * ```
 */
export const updatesOutcomeOf = (
  check: ExpoUpdatesCheck,
): Option.Option<Note> => outcomeNoteOf(newerCodeOfExpo(check))

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
  latest: ExpoUpdatesCheck
  listen: (
    listener: (event: Readonly<{ context: ExpoUpdatesCheck }>) => void,
  ) => unknown
  say: (note: Note) => void
}>): void => {
  const heard = { last: '' }
  const tell = (check: ExpoUpdatesCheck): void => {
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
