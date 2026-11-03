import { Array, Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  AppendCopySegment,
  AwaitCopyChange,
  type CompressedCopy,
  type CopyFeed,
  type CopySegment,
  EndCopyAudio,
  ReadCopySegments,
  RemoveCopyAudio,
  copyLifecycleIDOf,
  copyStreamIDOf,
  decodeCompressedCopy,
  decodeCopySegments,
  liveJoinSecondsOf,
  nextCopyStep,
} from './compressedCopy.js'

const folder = 'scribe/7e0f1b2c/generation-1/compressed-audio'

const copy = (overrides: Partial<CompressedCopy> = {}): CompressedCopy => ({
  streamID: '00a4b3a4-9cfe-476a-879f-113220fadad5',
  initializationPath: `${folder}/init.mp4`,
  codecs: 'mp4a.40.2',
  segmentSeconds: 6,
  segmentCount: 10,
  durationSeconds: 60,
  isFinished: false,
  ...overrides,
})

const segment = (index: number): CopySegment => ({
  index,
  startSeconds: index * 6,
  durationSeconds: 6,
  byteCount: 36_000,
  path: `${folder}/${String(index).padStart(6, '0')}.m4s`,
})

const segments = (from: number, to: number): ReadonlyArray<CopySegment> =>
  Array.makeBy(to - from, offset => segment(from + offset))

const feed = (overrides: Partial<CopyFeed> = {}): CopyFeed => ({
  positionSeconds: 0,
  isPlaying: false,
  buffered: [],
  knownSegments: [],
  copy: copy(),
  isEnded: false,
  ...overrides,
})

const range = (startSeconds: number, endSeconds: number) => ({
  startSeconds,
  endSeconds,
})

describe("the copy's stream (Scribe ADR 0091)", () => {
  it("is found by the id the phone gives it, from the recording's start", async () => {
    const lifecycleID = copyLifecycleIDOf(
      '7E0F1B2C-3D4E-4F50-8A6B-7C8D9E0F1A2B',
      1_793_668_368_183.4,
    )
    expect(lifecycleID).toBe(
      'v1:7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b:1793668368183',
    )
    expect(await Effect.runPromise(copyStreamIDOf(lifecycleID))).toBe(
      '00a4b3a4-9cfe-476a-879f-113220fadad5',
    )
  })

  it('reads the stream row once a segment is stored', () => {
    const row = {
      id: '00a4b3a4-9cfe-476a-879f-113220fadad5',
      codecs: 'mp4a.40.2',
      segmentSeconds: 6,
      initializationPath: `${folder}/init.mp4`,
      state: 'recording',
      segmentCount: 108,
      durationSeconds: 648.0213333333338,
    }
    expect(decodeCompressedCopy([row])).toEqual(
      Option.some(
        copy({ segmentCount: 108, durationSeconds: 648.0213333333338 }),
      ),
    )
    expect(decodeCompressedCopy([{ ...row, state: 'finished' }])).toEqual(
      Option.some(
        copy({
          segmentCount: 108,
          durationSeconds: 648.0213333333338,
          isFinished: true,
        }),
      ),
    )
    expect(
      decodeCompressedCopy([{ ...row, segmentCount: 0, durationSeconds: 0 }]),
    ).toEqual(Option.none())
    expect(decodeCompressedCopy([{ id: row.id, state: 'recording' }])).toEqual(
      Option.none(),
    )
    expect(decodeCompressedCopy([])).toEqual(Option.none())
  })

  it("reads a stream's segment rows in index order, each once", () => {
    const streamID = copy().streamID
    const row = (index: number) => ({ ...segment(index), streamID })
    expect(
      decodeCopySegments(
        [
          row(2),
          row(0),
          { ...row(1), streamID: 'another-stream' },
          { ...row(1), byteCount: 0 },
          row(2),
          { streamID, index: 3 },
        ],
        streamID,
      ),
    ).toEqual([segment(0), segment(2)])
  })

  it('joins a recording in progress 12 s behind the end of its copy', () => {
    expect(liveJoinSecondsOf(copy({ durationSeconds: 648 }))).toBe(636)
    expect(liveJoinSecondsOf(copy({ durationSeconds: 5.5 }))).toBe(0)
  })
})

describe('feeding the copy to the browser', () => {
  it('reads the rows around the listening position first', () => {
    expect(nextCopyStep(feed({ positionSeconds: 48 }))).toEqual(
      ReadCopySegments({ fromIndex: 7, toIndex: 10 }),
    )
  })

  it('while paused, appends only the segment at the position', () => {
    const known = segments(0, 10)
    expect(
      nextCopyStep(feed({ positionSeconds: 50, knownSegments: known })),
    ).toEqual(AppendCopySegment({ segment: segment(8) }))
    expect(
      nextCopyStep(
        feed({
          positionSeconds: 50,
          knownSegments: known,
          buffered: [range(48, 54)],
        }),
      ),
    ).toEqual(AwaitCopyChange())
  })

  it('while playing, keeps the next 30 seconds, then waits at the end of the copy', () => {
    const known = segments(0, 10)
    expect(
      nextCopyStep(
        feed({
          positionSeconds: 50,
          isPlaying: true,
          knownSegments: known,
          buffered: [range(48, 54)],
        }),
      ),
    ).toEqual(AppendCopySegment({ segment: segment(9) }))
    expect(
      nextCopyStep(
        feed({
          positionSeconds: 50,
          isPlaying: true,
          knownSegments: known,
          buffered: [range(48, 60)],
        }),
      ),
    ).toEqual(AwaitCopyChange())
  })

  it('reads the next rows when playing reaches past the rows it knows', () => {
    expect(
      nextCopyStep(
        feed({
          positionSeconds: 50,
          isPlaying: true,
          knownSegments: segments(0, 9),
          buffered: [range(48, 54)],
        }),
      ),
    ).toEqual(ReadCopySegments({ fromIndex: 9, toIndex: 10 }))
  })

  it('appends again a segment the browser dropped', () => {
    expect(
      nextCopyStep(
        feed({
          positionSeconds: 50,
          isPlaying: true,
          knownSegments: segments(0, 10),
          buffered: [range(54, 60)],
        }),
      ),
    ).toEqual(AppendCopySegment({ segment: segment(8) }))
  })

  it('removes audio more than two minutes behind the position', () => {
    expect(
      nextCopyStep(
        feed({
          positionSeconds: 300,
          isPlaying: true,
          knownSegments: segments(0, 60),
          copy: copy({ segmentCount: 60, durationSeconds: 360 }),
          buffered: [range(0, 336)],
        }),
      ),
    ).toEqual(RemoveCopyAudio({ startSeconds: 0, endSeconds: 180 }))
  })

  it('ends a finished copy once it is buffered to its end, once', () => {
    const finished = copy({ isFinished: true })
    const atTheEnd = feed({
      positionSeconds: 50,
      isPlaying: true,
      knownSegments: segments(0, 10),
      copy: finished,
      buffered: [range(48, 60)],
    })
    expect(nextCopyStep(atTheEnd)).toEqual(EndCopyAudio())
    expect(nextCopyStep({ ...atTheEnd, isEnded: true })).toEqual(
      AwaitCopyChange(),
    )
    expect(
      nextCopyStep({ ...atTheEnd, copy: copy({ isFinished: false }) }),
    ).toEqual(AwaitCopyChange())
  })

  it('waits while the copy has no segment', () => {
    expect(
      nextCopyStep(
        feed({ copy: copy({ segmentCount: 0, durationSeconds: 0 }) }),
      ),
    ).toEqual(AwaitCopyChange())
  })
})
