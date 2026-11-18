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

const ffmpegTimePattern = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/u

const secondsPerMinute = 60

const minutesPerHour = 60

/**
 * The audio output device a person chose for this process, by the number
 * `ffmpeg -f audiotoolbox -list_devices true` gives it: `FOLDKIT_AUDIO_DEVICE=4`
 * for the Mac mini's speakers on one Mac. None when the variable is unset
 * or is not a whole number, which plays on the system's default output.
 *
 * @example
 * ```typescript
 * audioDeviceFromEnv({ FOLDKIT_AUDIO_DEVICE: '3' }) // Some(3)
 * audioDeviceFromEnv({}) // None
 * ```
 */
export const audioDeviceFromEnv = (
  env: Readonly<Record<string, string | undefined>>,
): Option.Option<number> =>
  Option.filter(
    Option.map(Option.fromNullishOr(env['FOLDKIT_AUDIO_DEVICE']), Number),
    device => Number.isInteger(device) && device >= 0,
  )

/**
 * The arguments that play a file to one output device through ffmpeg's
 * AudioToolbox output: in real time, from the place, at the speed, with
 * the progress line the place is read from. ffplay cannot name a device,
 * so a chosen device plays this way.
 *
 * @example
 * ```typescript
 * ffmpegDeviceArgs(url, 61_500, 1.5, 3)
 * // ['-hide_banner', …, '-re', '-ss', '61.500', '-i', url, '-vn', '-af', 'atempo=1.5', '-f', 'audiotoolbox', '-audio_device_index', '3', '-']
 * ```
 */
export const ffmpegDeviceArgs = (
  url: string,
  fromMs: number,
  speed: Speed,
  device: number,
): ReadonlyArray<string> => [
  '-hide_banner',
  '-loglevel',
  'error',
  '-stats',
  '-re',
  '-ss',
  (fromMs / millisecondsPerSecond).toFixed(3),
  '-i',
  url,
  '-vn',
  '-af',
  `atempo=${speed.toString()}`,
  '-f',
  'audiotoolbox',
  '-audio_device_index',
  device.toString(),
  '-',
]

/**
 * The place a line of ffmpeg's progress reports, `time=00:00:05.12`: the
 * place playing started from plus the time played, at the speed. None for
 * any other line.
 *
 * @example
 * ```typescript
 * placeOfFfmpegStats('size=N/A time=00:00:05.12 bitrate=N/A', 60_000, 1.5) // Some(67_680)
 * ```
 */
export const placeOfFfmpegStats = (
  line: string,
  fromMs: number,
  speed: Speed,
): Option.Option<number> =>
  Option.map(String.match(ffmpegTimePattern)(line), match => {
    const [, hours = '0', minutes = '0', seconds = '0'] = match
    const playedSeconds =
      (Number(hours) * minutesPerHour + Number(minutes)) * secondsPerMinute +
      Number(seconds)
    return Math.round(fromMs + playedSeconds * millisecondsPerSecond * speed)
  })

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
  maybeDevice: Option.Option<number>,
): Stream.Stream<AudioEvent> =>
  Stream.callback<AudioEvent>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const finished = (event: AudioEvent): void => {
          Queue.offerUnsafe(queue, event)
          Queue.endUnsafe(queue)
        }
        const start = (player: Player, generation: number): ChildProcess => {
          const startedFromMs = player.placeMs
          const startedSpeed = player.speed
          const child = Option.match(maybeDevice, {
            onNone: () =>
              spawn(
                'ffplay',
                [...ffplayArgs(url, startedFromMs, startedSpeed)],
                {
                  stdio: ['ignore', 'ignore', 'pipe'],
                },
              ),
            onSome: device =>
              spawn(
                'ffmpeg',
                [...ffmpegDeviceArgs(url, startedFromMs, startedSpeed, device)],
                { stdio: ['ignore', 'ignore', 'pipe'] },
              ),
          })
          const placeMsOfLine = (line: string): Option.Option<number> =>
            Option.match(maybeDevice, {
              onNone: () =>
                Option.map(secondsOfStatsLine(line), seconds =>
                  Math.round(seconds * millisecondsPerSecond),
                ),
              onSome: () =>
                placeOfFfmpegStats(line, startedFromMs, startedSpeed),
            })
          child.stderr?.setEncoding('utf8')
          child.stderr?.on('data', (chunk: string) => {
            Array.forEach(chunk.split(/[\r\n]+/u), line => {
              Option.map(placeMsOfLine(line), reportedMs => {
                const placeMs = Math.min(track.durationMs, reportedMs)
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
                      wallClockMs: Date.now(),
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
 * plays, read from ffplay's own clock. It sounds on the system's default
 * output; with `FOLDKIT_AUDIO_DEVICE` set to a device's number it sounds
 * on that device, through ffmpeg's AudioToolbox output. A new speed restarts ffplay where
 * it is. A file that never starts, or stops before the end, reports why.
 * A recording with no audio file yet counts silently.
 */
export const ffplayAudioOutput = Layer.succeed(AudioOutput, {
  sound: (track, readSpeed) =>
    Option.match(track.maybeAudioUrl, {
      onNone: () => countedSound(track, readSpeed),
      onSome: url =>
        ffplaySound(url, track, readSpeed, audioDeviceFromEnv(process.env)),
    }),
})
