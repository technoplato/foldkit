import { Array, Effect, Option, Stream } from 'effect'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AudioOutput, Track } from './audio.js'
import {
  audioDeviceFromEnv,
  ffmpegDeviceArgs,
  ffplayAudioOutput,
  placeOfFfmpegStats,
} from './audio.node.js'
import { MediaId, Milliseconds } from './ids.js'

const fakeFfplay = `#!/bin/sh
case "$*" in
  *missing*) echo "Server returned 403 Forbidden" >&2; exit 0 ;;
esac
for second in 12.00 12.50 13.01 14.02; do
  printf '   %s M-A:  0.000 fd=   0 aq=    9KB vq=    0KB sq=    0B \\r' "$second" >&2
  sleep 0.05
done
exit 0
`

const originalPath = process.env['PATH']

beforeAll(() => {
  const directory = mkdtempSync(join(tmpdir(), 'fake-ffplay-'))
  const path = join(directory, 'ffplay')
  writeFileSync(path, fakeFfplay)
  chmodSync(path, 0o755)
  process.env['PATH'] = `${directory}:${originalPath ?? ''}`
})

afterAll(() => {
  process.env['PATH'] = originalPath
})

const trackOf = (url: string, durationMs: number) =>
  Track.make({
    mediaId: MediaId.make('evocation'),
    cue: 1,
    fromMs: Milliseconds.make(12_000),
    durationMs: Milliseconds.make(durationMs),
    maybeAudioUrl: Option.some(url),
  })

const eventsOf = (url: string, durationMs: number) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const output = yield* AudioOutput
      return yield* Stream.runCollect(
        output.sound(trackOf(url, durationMs), () => 1),
      )
    }).pipe(Effect.provide(ffplayAudioOutput)),
  ).then(events => Array.fromIterable(events))

describe('the ffplay audio output', () => {
  it('reports each new second from ffplay’s clock, when it was reached, then the end', async () => {
    const beforeMs = Date.now()
    const events = await eventsOf('https://audio.invalid/a.mp3', 15_000)
    const afterMs = Date.now()
    expect(
      Array.map(events, event =>
        event._tag === 'Advanced'
          ? { _tag: event._tag, placeMs: event.placeMs }
          : event,
      ),
    ).toEqual([
      { _tag: 'Advanced', placeMs: 13_010 },
      { _tag: 'Advanced', placeMs: 14_020 },
      { _tag: 'Ended' },
    ])
    expect(
      Array.every(
        events,
        event =>
          event._tag !== 'Advanced' ||
          (event.wallClockMs >= beforeMs && event.wallClockMs <= afterMs),
      ),
    ).toBe(true)
  })

  it('says the file could not be reached when ffplay never plays it', async () => {
    expect(await eventsOf('https://audio.invalid/missing.mp3', 15_000)).toEqual(
      [{ _tag: 'Failed', reason: 'the audio file could not be reached' }],
    )
  })

  it('says the audio stopped when ffplay quits before the end', async () => {
    const events = await eventsOf('https://audio.invalid/a.mp3', 600_000)
    expect(Array.last(events)).toEqual(
      Option.some({ _tag: 'Failed', reason: 'the audio stopped downloading' }),
    )
  })
})

describe('a chosen audio output device', () => {
  it('is the number FOLDKIT_AUDIO_DEVICE names, and the default output when it names none', () => {
    expect(audioDeviceFromEnv({ FOLDKIT_AUDIO_DEVICE: '3' })).toEqual(
      Option.some(3),
    )
    expect(audioDeviceFromEnv({})).toEqual(Option.none())
    expect(audioDeviceFromEnv({ FOLDKIT_AUDIO_DEVICE: 'speakers' })).toEqual(
      Option.none(),
    )
  })

  it('plays through ffmpeg to that device, in real time, from the place at the speed', () => {
    expect(
      ffmpegDeviceArgs('https://audio.invalid/a.m4a', 61_500, 1.5, 3),
    ).toEqual([
      '-hide_banner',
      '-loglevel',
      'error',
      '-stats',
      '-re',
      '-ss',
      '61.500',
      '-i',
      'https://audio.invalid/a.m4a',
      '-vn',
      '-af',
      'atempo=1.5',
      '-f',
      'audiotoolbox',
      '-audio_device_index',
      '3',
      '-',
    ])
  })

  it('reads the place from ffmpeg’s progress: the start plus the time played at the speed', () => {
    const line = 'size=N/A time=00:00:05.12 bitrate=N/A speed=   1x'
    expect(placeOfFfmpegStats(line, 60_000, 1)).toEqual(Option.some(65_120))
    expect(placeOfFfmpegStats(line, 60_000, 1.5)).toEqual(Option.some(67_680))
    expect(placeOfFfmpegStats('Press [q] to stop', 60_000, 1)).toEqual(
      Option.none(),
    )
  })
})
