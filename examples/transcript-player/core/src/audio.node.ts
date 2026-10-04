import { Array, Effect, Layer, Option, Queue, Stream, String } from 'effect'
import { type ChildProcess, spawn } from 'node:child_process'

import {
  type AudioEvent,
  AudioEvent as AudioEvents,
  AudioOutput,
  type Track,
  countedSound,
} from './audio.js'
import { Milliseconds, type Speed } from './ids.js'

// AUDIO

const millisecondsPerSecond = 1000

const speedCheckEveryMs = 1000

const endToleranceMs = 2000

const clockLinePattern = /^\s*(\d+(?:\.\d+)?)\s+M-A:/u

const ffplayArgs = (
  url: string,
  fromMs: number,
  speed: Speed,
): ReadonlyArray<string> => [
  '-nodisp',
  '-autoexit',
  '-hide_banner',
  '-loglevel',
  'error',
  '-stats',
  '-ss',
  (fromMs / millisecondsPerSecond).toFixed(3),
  '-af',
  `atempo=${speed.toString()}`,
  url,
]

const secondsOfStatsLine = (line: string): Option.Option<number> =>
  Option.flatMap(String.match(clockLinePattern)(line), match =>
    Option.map(Array.get(match, 1), Number),
  )

type Player = {
  placeMs: number
  speed: Speed
  isStopping: boolean
  hasSounded: boolean
  generation: number
}

const ffplaySound = (
  url: string,
  track: Track,
  readSpeed: () => Speed,
): Stream.Stream<AudioEvent> =>
  Stream.callback<AudioEvent>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const finished = (event: AudioEvent): void => {
          Queue.offerUnsafe(queue, event)
          Queue.endUnsafe(queue)
        }
        const start = (player: Player, generation: number): ChildProcess => {
          const child = spawn(
            'ffplay',
            [...ffplayArgs(url, player.placeMs, player.speed)],
            { stdio: ['ignore', 'ignore', 'pipe'] },
          )
          child.stderr?.setEncoding('utf8')
          child.stderr?.on('data', (chunk: string) => {
            Array.forEach(chunk.split(/[\r\n]+/u), line => {
              Option.map(secondsOfStatsLine(line), seconds => {
                const placeMs = Math.min(
                  track.durationMs,
                  Math.round(seconds * millisecondsPerSecond),
                )
                const isNewSecond =
                  Math.floor(placeMs / millisecondsPerSecond) !==
                  Math.floor(player.placeMs / millisecondsPerSecond)
                player.hasSounded = true
                player.placeMs = placeMs
                if (isNewSecond) {
                  Queue.offerUnsafe(
                    queue,
                    AudioEvents.Advanced({
                      placeMs: Milliseconds.make(placeMs),
                    }),
                  )
                }
              })
            })
          })
          child.on('error', () => {
            finished(
              AudioEvents.Failed({
                reason:
                  'this terminal has no audio player; install ffmpeg, which brings ffplay',
              }),
            )
          })
          child.on('exit', () => {
            if (player.isStopping || generation !== player.generation) {
              return
            }
            if (!player.hasSounded) {
              finished(
                AudioEvents.Failed({
                  reason: 'the audio file could not be reached',
                }),
              )
            } else if (player.placeMs >= track.durationMs - endToleranceMs) {
              finished(AudioEvents.Ended())
            } else {
              finished(
                AudioEvents.Failed({ reason: 'the audio stopped downloading' }),
              )
            }
          })
          return child
        }
        const player: Player = {
          placeMs: track.fromMs,
          speed: readSpeed(),
          isStopping: false,
          hasSounded: false,
          generation: 0,
        }
        const running = { child: start(player, player.generation) }
        const speedCheck = setInterval(() => {
          const speed = readSpeed()
          if (speed !== player.speed) {
            const previous = running.child
            player.speed = speed
            player.generation += 1
            running.child = start(player, player.generation)
            previous.kill('SIGTERM')
          }
        }, speedCheckEveryMs)
        return { player, running, speedCheck }
      }),
      ({ player, running, speedCheck }) =>
        Effect.sync(() => {
          player.isStopping = true
          clearInterval(speedCheck)
          running.child.kill('SIGTERM')
        }),
    ),
  )

/**
 * A terminal's audio output: `ffplay` from ffmpeg, streaming the track's
 * file from its place at its speed, and reporting each new second it
 * plays, read from ffplay's own clock. A new speed restarts ffplay where
 * it is. A file that never starts, or stops before the end, reports why.
 * A recording with no audio file yet counts silently.
 */
export const ffplayAudioOutput = Layer.succeed(AudioOutput, {
  sound: (track, readSpeed) =>
    Option.match(track.maybeAudioUrl, {
      onNone: () => countedSound(track, readSpeed),
      onSome: url => ffplaySound(url, track, readSpeed),
    }),
})
