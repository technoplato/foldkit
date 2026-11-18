import { Effect, Layer, Option, Schema as S } from 'effect'
import { execFile } from 'node:child_process'

import type { ImportOwner } from './libraryImport.js'
import { type AudibleProblem, Unavailable } from './problem.js'
import { AudioQueue, type AudioQueueShape } from './server.node.js'
import { AudioStatusJson } from './service.js'
import type { Asin, AudioStatus } from './title.js'

// AUDIO QUEUE

/**
 * The command that answers the owned books' audio, such as Scribe's
 * `books_ingest.py audio` run by its own Python: `script audio [--queue
 * ASIN --owner EMAIL]` prints the status as JSON, or `{"problem": "…"}`
 * and exits 1.
 */
export type AudioQueueProcess = Readonly<{ command: string; script: string }>

/**
 * The queue the environment names: `BOOKS_AUDIO_QUEUE_COMMAND` and
 * `BOOKS_AUDIO_QUEUE_SCRIPT`, both, or none.
 *
 * @example
 * ```typescript
 * audioQueueFromEnv({ BOOKS_AUDIO_QUEUE_COMMAND: '/usr/bin/python3', BOOKS_AUDIO_QUEUE_SCRIPT: '/x/books_ingest.py' })
 * // Some({ command: '/usr/bin/python3', script: '/x/books_ingest.py' })
 * ```
 */
export const audioQueueFromEnv = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): Option.Option<AudioQueueProcess> => {
  const command = env['BOOKS_AUDIO_QUEUE_COMMAND']?.trim() ?? ''
  const script = env['BOOKS_AUDIO_QUEUE_SCRIPT']?.trim() ?? ''
  return command !== '' && script !== ''
    ? Option.some({ command, script })
    : Option.none()
}

const ProblemLine = S.fromJsonString(S.Struct({ problem: S.String }))

const answerTimeoutMs = 60_000

const ran = (
  queue: AudioQueueProcess,
  args: ReadonlyArray<string>,
): Effect.Effect<AudioStatus, AudibleProblem> =>
  Effect.callback<AudioStatus, AudibleProblem>(resume => {
    execFile(
      queue.command,
      [queue.script, 'audio', ...args],
      { timeout: answerTimeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        const line = stdout.trim().split('\n').pop() ?? ''
        if (error === null) {
          const decoded = S.decodeUnknownOption(AudioStatusJson)(line)
          resume(
            Option.match(decoded, {
              onNone: () =>
                Effect.fail(
                  Unavailable({
                    reason:
                      'the audio queue answered something Books cannot read',
                  }),
                ),
              onSome: Effect.succeed,
            }),
          )
        } else {
          resume(
            Effect.fail(
              Option.match(S.decodeUnknownOption(ProblemLine)(line), {
                onNone: () =>
                  Unavailable({ reason: 'the audio queue did not answer' }),
                onSome: ({ problem }) => Unavailable({ reason: problem }),
              }),
            ),
          )
        }
      },
    )
  })

/** The audio queue as a command this computer runs. */
export const processAudioQueue = (
  queue: AudioQueueProcess,
): AudioQueueShape => ({
  status: () => ran(queue, []),
  queue: (owner: ImportOwner, asin: Asin) =>
    ran(queue, ['--queue', asin, '--owner', owner.email]),
})

/** The audio queue the environment names, or the default that says none is set up. */
export const audioQueueLayer = (
  maybeQueue: Option.Option<AudioQueueProcess> = audioQueueFromEnv(),
): Layer.Layer<never> =>
  Option.match(maybeQueue, {
    onNone: () => Layer.empty,
    onSome: queue => Layer.succeed(AudioQueue, processAudioQueue(queue)),
  })
