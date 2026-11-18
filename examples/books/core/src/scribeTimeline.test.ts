import { Array, Option, Schema as S } from 'effect'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { Milliseconds, TitleSlug } from './ids.js'
import type { Title } from './model.js'
import { type CaptureGap, type RecordingClock } from './recordingClock.js'
import { sampleTitles } from './sample.js'
import {
  type InstantRow,
  type PlayFacts,
  PlayStarted,
  PlayStopped,
  type TimelineRecording,
  type TimelineStretch,
  bookPlayFactsOf,
  bookPlayOpenUrlOf,
  booksPlayer,
  closingRowOf,
  mediaPlayEventIdOf,
  mediaPlayIdOf,
  mediaPlayPayload,
  recordingOfRow,
  rowsOnRecording,
  stretchIdOf,
  unendedPlaysOf,
  writtenStartOfRow,
} from './scribeTimeline.js'
import { stableUUID } from './stableId.js'

// Scribe Videos' shared payloads (realtime-voice Fixtures/runtime-media-play-payloads.json, 039ae49cb), which its
// writer (TimelineRows.mediaPlayPayload) and Scribe's reader (SharedModels.RuntimeMediaPlay) both test against.
const SharedFixture = S.Struct({
  playStarted: S.String,
  playStopped: S.String,
  playWithoutOptionals: S.String,
})
const fixture = S.decodeUnknownSync(SharedFixture)(
  JSON.parse(
    readFileSync(
      new URL('./fixtures/runtime-media-play-payloads.json', import.meta.url),
      'utf8',
    ),
  ),
)

const episode: PlayFacts = {
  kind: 'podcastEpisode',
  mediaKey: 'podcast:matt-and-shanes-secret-podcast:ep-004',
  maybeTitle: Option.some("Ep. 4 - Tybalt's Hole"),
  maybeShowTitle: Option.some("Matt and Shane's Secret Podcast"),
  maybeArtworkUrl: Option.some(
    'https://ot-feed.knophy.com/artwork/old-testament.jpg',
  ),
  maybeMediaLengthSeconds: Option.some(3600.5),
  player: 'com.michaellustig.scribevideos',
  source: 'app',
}

const origin = 'https://books.pisspoursoftware.xyz'

const lanternKeeper: Title = {
  ...Option.getOrThrow(Array.head(sampleTitles)),
  maybeCoverUrl: Option.some('https://files.instantdb.com/cover.jpg'),
}

const recordingStartMs = 1_792_347_800_000
const stretchStartMs = recordingStartMs + 600_000
const stretchEndMs = stretchStartMs + 89_000

const liveRecordingId = '0f0e0d0c-0b0a-4908-8706-050403020100'
const appleOwner = 'a1b2c3d4-0000-4000-8000-0000000000a1'

const recordingOf = (
  fields: Partial<TimelineRecording> & Pick<TimelineRecording, 'recordingId'>,
): TimelineRecording => ({
  ownerUserId: appleOwner,
  clock: { startedAtMs: recordingStartMs, gaps: [] },
  durationSeconds: (stretchEndMs - recordingStartMs) / 1000,
  status: 'Listed',
  ...fields,
})

const liveRecording = recordingOf({ recordingId: liveRecordingId })

const stretchId = stretchIdOf('audiobook:the-lantern-keeper', stretchStartMs)

const openStretch: TimelineStretch = {
  stretchId,
  mediaStartSeconds: 723.4,
  startedAtMs: stretchStartMs,
  playbackRate: 1,
  maybeEnd: Option.none(),
}

const pausedStretch: TimelineStretch = {
  ...openStretch,
  maybeEnd: Option.some({
    mediaEndSeconds: 812.4,
    endedAtMs: stretchEndMs,
    reason: 'paused',
  }),
}

const facts = bookPlayFactsOf(lanternKeeper, origin)

const openUrlAt = (mediaSeconds: number) =>
  bookPlayOpenUrlOf(lanternKeeper, origin, mediaSeconds)

const rowsOf = (
  recording: TimelineRecording,
  stretch: TimelineStretch,
  nowMs: number,
  maybeWrittenStart = Option.none<ReturnType<typeof writtenStartOfRow>>(),
): ReadonlyArray<InstantRow> =>
  rowsOnRecording({
    recording,
    stretch,
    facts,
    openUrlAt,
    nowMs,
    maybeWrittenStart: Option.flatten(maybeWrittenStart),
  })

const bookPayload = (playId: string, change: string, mediaStart = '723.4') =>
  `{"mediaPlay":{"_0":{"artworkURL":"https://books.pisspoursoftware.xyz/books/the-lantern-keeper/cover","change":${change},"kind":"audiobook","mediaKey":"audiobook:the-lantern-keeper","mediaLengthSeconds":4800,"mediaStartSeconds":${mediaStart},"openURL":"https://books.pisspoursoftware.xyz/books/the-lantern-keeper/listen/${mediaStart === '723.4' ? '12m03s' : '12m33s'}","playID":"${playId.toUpperCase()}","playbackRate":1,"player":"books.pisspoursoftware.xyz","showTitle":"Ada Quill","source":"books","startedAt":${(mediaStart === '723.4' ? stretchStartMs : stretchStartMs + 30_000).toString()},"title":"The Lantern Keeper"}}}`

describe('a play on Scribe’s timeline', () => {
  it('writes Scribe Videos’ shared payloads byte for byte', () => {
    const playStart = {
      playId: '2c1d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
      facts: episode,
      mediaStartSeconds: 754,
      startedAtMs: 1_791_050_001_500,
      playbackRate: 1,
      maybeOpenUrl: Option.some(
        'scribevideos://play?media=podcast:matt-and-shanes-secret-podcast:ep-004&t=754',
      ),
    }
    expect(mediaPlayPayload({ ...playStart, change: PlayStarted() })).toBe(
      fixture.playStarted,
    )
    expect(
      mediaPlayPayload({
        ...playStart,
        change: PlayStopped({ mediaEndSeconds: 812.4, reason: 'paused' }),
      }),
    ).toBe(fixture.playStopped)
    expect(
      mediaPlayPayload({
        playId: '0f1e2d3c-4b5a-4987-8695-a4b3c2d1e0f9',
        facts: {
          kind: 'podcastEpisode',
          mediaKey: 'podcast:matt-and-shanes-secret-podcast:ep-001',
          maybeTitle: Option.none(),
          maybeShowTitle: Option.none(),
          maybeArtworkUrl: Option.none(),
          maybeMediaLengthSeconds: Option.none(),
          player: 'com.michaellustig.scribevideos.dev',
          source: 'app',
        },
        mediaStartSeconds: 0,
        startedAtMs: 1_791_050_001_500,
        playbackRate: 1.5,
        maybeOpenUrl: Option.none(),
        change: PlayStarted(),
      }),
    ).toBe(fixture.playWithoutOptionals)
  })

  it('reads a book as an audiobook by its authors, with its public cover and a link to the second it began', () => {
    expect(facts).toEqual({
      kind: 'audiobook',
      mediaKey: 'audiobook:the-lantern-keeper',
      maybeTitle: Option.some('The Lantern Keeper'),
      maybeShowTitle: Option.some('Ada Quill'),
      maybeArtworkUrl: Option.some(
        'https://books.pisspoursoftware.xyz/books/the-lantern-keeper/cover',
      ),
      maybeMediaLengthSeconds: Option.some(4800),
      player: 'books.pisspoursoftware.xyz',
      source: 'books',
    })
    expect(openUrlAt(723.4)).toEqual(
      Option.some(
        'https://books.pisspoursoftware.xyz/books/the-lantern-keeper/listen/12m03s',
      ),
    )
    const coverless = bookPlayFactsOf(
      {
        ...lanternKeeper,
        maybeCoverUrl: Option.none(),
        authors: ['Iris Penn', 'Tomas Hale'],
      },
      origin,
    )
    expect(coverless.maybeArtworkUrl).toEqual(Option.none())
    expect(coverless.maybeShowTitle).toEqual(
      Option.some('Iris Penn, Tomas Hale'),
    )
  })

  it('names a play by its stretch and recording, as Scribe Videos does, so a retry lands on the same rows', () => {
    expect(stretchId).toBe(
      stableUUID(
        `books-stretch|audiobook:the-lantern-keeper|${stretchStartMs.toString()}`,
      ),
    )
    const playId = mediaPlayIdOf(stretchId, liveRecordingId.toUpperCase())
    expect(playId).toBe(
      stableUUID(`media-play|${stretchId}|${liveRecordingId}`),
    )
    expect(mediaPlayEventIdOf(playId, 'start')).toBe(
      stableUUID(`media-play-event|${playId}|start`),
    )
    expect(mediaPlayEventIdOf(playId, 'end')).toBe(
      stableUUID(`media-play-event|${playId}|end`),
    )
  })

  it('puts a stretch that has played 3 s on the live recording: its start, at the recording’s second, owned by the recording’s owner', () => {
    const playId = mediaPlayIdOf(stretchId, liveRecordingId)
    expect(rowsOf(liveRecording, openStretch, stretchStartMs + 3_000)).toEqual([
      {
        namespace: 'recordingRuntimeEvents',
        id: mediaPlayEventIdOf(playId, 'start'),
        attrs: {
          ownerUserID: appleOwner,
          recordingID: liveRecordingId,
          formatVersion: 1,
          kind: 'mediaPlay',
          timestampSeconds: 600,
          capturedAtMs: stretchStartMs,
          payloadJSON: bookPayload(playId, '{"started":{}}'),
          updatedAtMs: stretchStartMs,
        },
        links: { recording: liveRecordingId },
      },
    ])
  })

  it('writes the start and the end when it stops, the end linked to its start and its length', () => {
    const playId = mediaPlayIdOf(stretchId, liveRecordingId)
    const rows = rowsOf(liveRecording, pausedStretch, stretchEndMs + 500)
    expect(Array.map(rows, row => row.id)).toEqual([
      mediaPlayEventIdOf(playId, 'start'),
      mediaPlayEventIdOf(playId, 'end'),
    ])
    expect(Array.last(rows)).toEqual(
      Option.some({
        namespace: 'recordingRuntimeEvents',
        id: mediaPlayEventIdOf(playId, 'end'),
        attrs: {
          ownerUserID: appleOwner,
          recordingID: liveRecordingId,
          formatVersion: 1,
          kind: 'mediaPlay',
          timestampSeconds: 689,
          capturedAtMs: stretchEndMs,
          payloadJSON: bookPayload(
            playId,
            '{"stopped":{"mediaEndSeconds":812.4,"reason":"paused"}}',
          ),
          updatedAtMs: stretchEndMs,
          spanStartID: mediaPlayEventIdOf(playId, 'start'),
          spanDurationSeconds: 89,
        },
        links: { recording: liveRecordingId },
      }),
    )
  })

  it('keeps the start already in Instant, which never changes, and ends from it', () => {
    const playId = mediaPlayIdOf(stretchId, liveRecordingId)
    const written = writtenStartOfRow({
      id: mediaPlayEventIdOf(playId, 'start'),
      kind: 'mediaPlay',
      recordingID: liveRecordingId,
      timestampSeconds: 599.5,
      capturedAtMs: stretchStartMs,
      payloadJSON: bookPayload(playId, '{"started":{}}'),
    })
    expect(written).toEqual(
      Option.some({
        startSeconds: 599.5,
        mediaStartSeconds: 723.4,
        startedAtMs: stretchStartMs,
      }),
    )
    const rows = rowsOf(
      liveRecording,
      pausedStretch,
      stretchEndMs + 500,
      Option.some(written),
    )
    expect(Array.map(rows, row => row.id)).toEqual([
      mediaPlayEventIdOf(playId, 'end'),
    ])
    expect(
      Option.map(Array.head(rows), row => row.attrs['spanDurationSeconds']),
    ).toEqual(Option.some(89.5))
  })

  it('starts on a recording that began while the book played at that recording’s first second', () => {
    const lateRecording = recordingOf({
      recordingId: 'late-recording',
      clock: { startedAtMs: stretchStartMs + 30_000, gaps: [] },
    })
    const playId = mediaPlayIdOf(stretchId, 'late-recording')
    const rows = rowsOf(lateRecording, pausedStretch, stretchEndMs + 500)
    expect(
      Array.map(rows, row => [
        row.attrs['timestampSeconds'],
        row.attrs['payloadJSON'],
      ]),
    ).toEqual([
      [0, bookPayload(playId, '{"started":{}}', '753.4')],
      [
        59,
        bookPayload(
          playId,
          '{"stopped":{"mediaEndSeconds":812.4,"reason":"paused"}}',
          '753.4',
        ),
      ],
    ])
  })

  it('ends at the recording’s stop when the recording stopped while the book played', () => {
    const stopped = recordingOf({
      recordingId: 'stopped-recording',
      durationSeconds: 640,
    })
    const rows = rowsOf(stopped, pausedStretch, stretchEndMs + 500)
    expect(
      Option.map(Array.last(rows), row => [
        row.attrs['timestampSeconds'],
        row.attrs['capturedAtMs'],
        JSON.parse(String(row.attrs['payloadJSON'])).mediaPlay._0.change,
      ]),
    ).toEqual(
      Option.some([
        640,
        stretchStartMs + 40_000,
        { stopped: { mediaEndSeconds: 763.4, reason: 'recordingStopped' } },
      ]),
    )
  })

  it('counts a stretch across a pause in the recording on the recording’s own clock', () => {
    const pauseStartedAtMs = stretchStartMs + 20_000
    const gaps: ReadonlyArray<CaptureGap> = [
      {
        offsetSeconds: 620,
        startedAtMs: pauseStartedAtMs,
        maybeEndedAtMs: Option.some(pauseStartedAtMs + 30_000),
      },
    ]
    const clock: RecordingClock = { startedAtMs: recordingStartMs, gaps }
    const paused = recordingOf({ recordingId: liveRecordingId, clock })
    const rows = rowsOf(paused, pausedStretch, stretchEndMs + 500)
    expect(Array.map(rows, row => row.attrs['timestampSeconds'])).toEqual([
      600, 659,
    ])
    expect(
      Option.map(Array.last(rows), row => row.attrs['spanDurationSeconds']),
    ).toEqual(Option.some(59))
  })

  it('counts a recording live while its duration heartbeat is under 15 s old, whatever its stamp says', () => {
    const quietSince = (seconds: number) =>
      recordingOf({
        recordingId: liveRecordingId,
        durationSeconds:
          (stretchStartMs + 3_000 - seconds * 1000 - recordingStartMs) / 1000,
      })
    expect(rowsOf(quietSince(4), openStretch, stretchStartMs + 3_000)).toEqual(
      rowsOf(liveRecording, openStretch, stretchStartMs + 3_000),
    )
    expect(rowsOf(quietSince(20), openStretch, stretchStartMs + 3_000)).toEqual(
      [],
    )
  })

  it('leaves out a recording that stopped before the book played, and one in Recently Deleted', () => {
    expect(
      rowsOf(
        recordingOf({
          recordingId: 'earlier',
          durationSeconds: 300,
        }),
        pausedStretch,
        stretchEndMs + 500,
      ),
    ).toEqual([])
    expect(
      rowsOf(
        recordingOf({ recordingId: 'deleted', status: 'RecentlyDeleted' }),
        pausedStretch,
        stretchEndMs + 500,
      ),
    ).toEqual([])
  })

  it('reads a recording row, deleted once in Recently Deleted, whatever its activity stamp says', () => {
    const row = {
      id: liveRecordingId,
      ownerUserID: appleOwner,
      startedAtMs: recordingStartMs,
      durationSeconds: 774.2,
      activityKind: 'active',
      captureGapsJSON: JSON.stringify([
        { offsetSeconds: 10, startedAtMs: recordingStartMs + 10_000 },
      ]),
    }
    expect(recordingOfRow(row)).toEqual(
      Option.some({
        recordingId: liveRecordingId,
        ownerUserId: appleOwner,
        clock: {
          startedAtMs: recordingStartMs,
          gaps: [
            {
              offsetSeconds: 10,
              startedAtMs: recordingStartMs + 10_000,
              maybeEndedAtMs: Option.none(),
            },
          ],
        },
        durationSeconds: 774.2,
        status: 'Listed',
      }),
    )
    expect(
      Option.map(
        recordingOfRow({ ...row, activityKind: null }),
        recording => recording.status,
      ),
    ).toEqual(Option.some('Listed'))
    expect(
      Option.map(
        recordingOfRow({ ...row, deletedAtMs: recordingStartMs + 1 }),
        recording => recording.status,
      ),
    ).toEqual(Option.some('RecentlyDeleted'))
    expect(recordingOfRow({ id: 'no-start' })).toEqual(Option.none())
  })
})

describe('a play a closed page left open', () => {
  const playId = mediaPlayIdOf(stretchId, liveRecordingId)
  const startRow = {
    id: mediaPlayEventIdOf(playId, 'start'),
    recordingID: liveRecordingId,
    kind: 'mediaPlay',
    timestampSeconds: 600,
    capturedAtMs: stretchStartMs,
    payloadJSON: bookPayload(playId, '{"started":{}}'),
  }
  const endRow = {
    id: mediaPlayEventIdOf(playId, 'end'),
    recordingID: liveRecordingId,
    kind: 'mediaPlay',
    timestampSeconds: 689,
    capturedAtMs: stretchEndMs,
    spanStartID: mediaPlayEventIdOf(playId, 'start'),
    payloadJSON: bookPayload(
      playId,
      '{"stopped":{"mediaEndSeconds":812.4,"reason":"paused"}}',
    ),
  }
  const scribeVideosStart = {
    ...startRow,
    id: 'another-start',
    payloadJSON: startRow.payloadJSON.replace(
      '"player":"books.pisspoursoftware.xyz"',
      '"player":"com.michaellustig.scribevideos"',
    ),
  }

  it('is a start Books wrote whose end never came, on a recording it knows', () => {
    const recordings = [liveRecording]
    expect(
      unendedPlaysOf([startRow, scribeVideosStart], recordings, booksPlayer),
    ).toEqual([
      {
        playId,
        recording: liveRecording,
        mediaKey: 'audiobook:the-lantern-keeper',
        mediaStartSeconds: 723.4,
        startedAtMs: stretchStartMs,
        playbackRate: 1,
        startSeconds: 600,
        startPayload: startRow.payloadJSON,
        maybeNextPlayStartedAtMs: Option.none(),
      },
    ])
    expect(unendedPlaysOf([startRow, endRow], recordings, booksPlayer)).toEqual(
      [],
    )
    expect(unendedPlaysOf([startRow], [], booksPlayer)).toEqual([])
  })

  it('knows when a later play of the same title began, but not the same stretch on a recording begun later', () => {
    const laterPlay = {
      ...startRow,
      id: 'later-start',
      capturedAtMs: stretchStartMs + 600_000,
      payloadJSON: startRow.payloadJSON
        .replace(
          `"startedAt":${stretchStartMs.toString()}`,
          `"startedAt":${(stretchStartMs + 600_000).toString()}`,
        )
        .replace('"mediaStartSeconds":723.4', '"mediaStartSeconds":100'),
    }
    const sameStretchLater = {
      ...startRow,
      id: 'same-stretch-start',
      recordingID: 'late-recording',
      capturedAtMs: stretchStartMs + 30_000,
      payloadJSON: startRow.payloadJSON
        .replace(
          `"startedAt":${stretchStartMs.toString()}`,
          `"startedAt":${(stretchStartMs + 30_000).toString()}`,
        )
        .replace('"mediaStartSeconds":723.4', '"mediaStartSeconds":753.4'),
    }
    const [play] = unendedPlaysOf(
      [startRow, sameStretchLater, laterPlay],
      [liveRecording],
      booksPlayer,
    )
    expect(play?.maybeNextPlayStartedAtMs).toEqual(
      Option.some(stretchStartMs + 600_000),
    )
  })

  it('ends where the listener was last saved, with the start’s own words, as the page closing', () => {
    const hourLong = recordingOf({
      recordingId: liveRecordingId,
      durationSeconds: 3_600,
    })
    const [play] = unendedPlaysOf([startRow], [hourLong], booksPlayer)
    expect(
      closingRowOf({
        play: Option.getOrThrow(Option.fromNullishOr(play)),
        end: {
          mediaEndSeconds: 843.4,
          endedAtMs: stretchStartMs + 120_000,
          reason: 'appClosed',
        },
        nowMs: stretchStartMs + 3_600_000,
      }),
    ).toEqual(
      Option.some({
        namespace: 'recordingRuntimeEvents',
        id: mediaPlayEventIdOf(playId, 'end'),
        attrs: {
          ownerUserID: appleOwner,
          recordingID: liveRecordingId,
          formatVersion: 1,
          kind: 'mediaPlay',
          timestampSeconds: 720,
          capturedAtMs: stretchStartMs + 120_000,
          payloadJSON: bookPayload(
            playId,
            '{"stopped":{"mediaEndSeconds":843.4,"reason":"appClosed"}}',
          ),
          updatedAtMs: stretchStartMs + 120_000,
          spanStartID: mediaPlayEventIdOf(playId, 'start'),
          spanDurationSeconds: 120,
        },
        links: { recording: liveRecordingId },
      }),
    )
  })

  it('ends at the recording’s stop when the recording stopped first', () => {
    const stopped = recordingOf({
      recordingId: liveRecordingId,
      durationSeconds: 640,
    })
    const [play] = unendedPlaysOf([startRow], [stopped], booksPlayer)
    const row = closingRowOf({
      play: Option.getOrThrow(Option.fromNullishOr(play)),
      end: {
        mediaEndSeconds: 843.4,
        endedAtMs: stretchStartMs + 120_000,
        reason: 'appClosed',
      },
      nowMs: stretchStartMs + 3_600_000,
    })
    expect(
      Option.map(row, ({ attrs }) => [
        attrs['timestampSeconds'],
        JSON.parse(String(attrs['payloadJSON'])).mediaPlay._0.change,
      ]),
    ).toEqual(
      Option.some([
        640,
        { stopped: { mediaEndSeconds: 763.4, reason: 'recordingStopped' } },
      ]),
    )
  })
})

describe('the sample title', () => {
  it('is the made-up library’s first, so the payloads above name nobody real', () => {
    expect(lanternKeeper.slug).toBe(TitleSlug.make('the-lantern-keeper'))
    expect(lanternKeeper.durationMs).toBe(Milliseconds.make(4_800_000))
  })
})
