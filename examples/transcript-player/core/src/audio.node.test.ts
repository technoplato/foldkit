import { Array, Effect, Option, Stream } from 'effect'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AudioOutput, Track } from './audio.js'
import { ffplayAudioOutput } from './audio.node.js'
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
  it('reports each new second from ffplay’s clock, then the end', async () => {
    expect(await eventsOf('https://audio.invalid/a.mp3', 15_000)).toEqual([
      { _tag: 'Advanced', placeMs: 13_010 },
      { _tag: 'Advanced', placeMs: 14_020 },
      { _tag: 'Ended' },
    ])
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
