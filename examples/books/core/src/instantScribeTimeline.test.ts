import { Array, Effect, Option, Result } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

import type { ProgramLogDatabase } from '@foldkit/instant/browser'

import { Milliseconds } from './ids.js'
import { makeInstantScribeTimeline } from './instantScribeTimeline.js'
import type { Title } from './model.js'
import { sampleTitles } from './sample.js'
import {
  mediaPlayEventIdOf,
  mediaPlayIdOf,
  stretchIdOf,
} from './scribeTimeline.js'
import { type Stretch, StretchBegan, StretchEnded } from './stretch.js'

const emailUser = 'a1b2c3d4-0000-4000-8000-0000000000e1'
const appleUser = 'a1b2c3d4-0000-4000-8000-0000000000a2'
const liveRecordingId = '0f0e0d0c-0b0a-4908-8706-050403020100'
const recordingStartMs = 1_792_347_800_000
const stretchStartMs = recordingStartMs + 600_000

const lanternKeeper: Title = Option.getOrThrow(Array.head(sampleTitles))

const stretch: Stretch = {
  mediaStartMs: Milliseconds.make(723_000),
  startedAtMs: stretchStartMs,
  speed: 1,
  lastPlaceMs: Milliseconds.make(726_000),
  lastAtMs: stretchStartMs + 3_000,
}

const began = StretchBegan({ stretch })

const ended = StretchEnded({
  stretch: {
    ...stretch,
    lastPlaceMs: Milliseconds.make(812_000),
    lastAtMs: stretchStartMs + 89_000,
  },
  end: {
    mediaEndMs: Milliseconds.make(812_000),
    endedAtMs: stretchStartMs + 89_000,
    reason: 'Paused',
  },
})

type Step = Readonly<{
  namespace: string
  id: string
  attrs: Readonly<Record<string, unknown>>
  links: Readonly<Record<string, string>>
}>

type FakeOptions = Readonly<{
  recordings?: ReadonlyArray<unknown>
  runtimeEvents?: ReadonlyArray<unknown>
  refuseWrite?: string
}>

const fakeDatabase = (options: FakeOptions = {}) => {
  const queries: Array<unknown> = []
  const transactions: Array<ReadonlyArray<Step>> = []
  const stepOf = (namespace: string, id: string) => {
    const step = { namespace, id, attrs: {}, links: {} }
    const chain = {
      update: (attrs: Record<string, unknown>) => {
        step.attrs = attrs
        return chain
      },
      link: (links: Record<string, string>) => {
        step.links = links
        return chain
      },
      step,
    }
    return chain
  }
  const tx = new Proxy(
    {},
    {
      get: (_target, namespace: string) =>
        new Proxy({}, { get: (_inner, id: string) => stepOf(namespace, id) }),
    },
  )
  const database = {
    getAuth: () =>
      Promise.resolve({ id: emailUser, email: 'listener@example.invalid' }),
    queryOnce: (query: Record<string, unknown>) => {
      queries.push(query)
      if ('$users' in query) {
        return Promise.resolve({
          data: {
            $users: [
              {
                id: emailUser,
                accountLink: [
                  {
                    id: 'link-1',
                    members: [{ id: appleUser }, { id: emailUser }],
                  },
                ],
              },
            ],
          },
        })
      } else if ('recordings' in query) {
        return Promise.resolve({
          data: { recordings: options.recordings ?? [] },
        })
      } else {
        return Promise.resolve({
          data: { recordingRuntimeEvents: options.runtimeEvents ?? [] },
        })
      }
    },
    transact: (steps: ReadonlyArray<{ step: Step }>) => {
      if (options.refuseWrite !== undefined) {
        return Promise.reject(new Error(options.refuseWrite))
      }
      transactions.push(Array.map(steps, ({ step }) => step))
      return Promise.resolve({ status: 'synced' })
    },
    tx,
  }
  return {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    database: database as unknown as ProgramLogDatabase,
    queries,
    transactions,
  }
}

const liveRecordingRow = {
  id: liveRecordingId,
  ownerUserID: appleUser,
  startedAtMs: recordingStartMs,
  durationSeconds: 640,
  activityKind: 'active',
}

const reported = (
  fake: ReturnType<typeof fakeDatabase>,
  event: typeof began | typeof ended,
  nowMs: number,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* TestClock.setTime(nowMs)
      const timeline = yield* makeInstantScribeTimeline(fake.database, {
        origin: 'https://books.pisspoursoftware.xyz',
      })
      const result = yield* Effect.result(timeline.report(lanternKeeper, event))
      return Result.match(result, {
        onSuccess: success => ({ _tag: 'Success', success }),
        onFailure: failure => ({ _tag: 'Failure', failure }),
      })
    }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
  )

const playId = mediaPlayIdOf(
  stretchIdOf(`audiobook:${lanternKeeper.mediaId}`, stretchStartMs),
  liveRecordingId,
)

const bookStartRow = {
  id: mediaPlayEventIdOf(playId, 'start'),
  recordingID: liveRecordingId,
  kind: 'mediaPlay',
  timestampSeconds: 600,
  capturedAtMs: stretchStartMs,
  payloadJSON: `{"mediaPlay":{"_0":{"change":{"started":{}},"kind":"audiobook","mediaKey":"audiobook:${lanternKeeper.mediaId}","mediaStartSeconds":723,"playID":"${playId.toUpperCase()}","playbackRate":1,"player":"books.pisspoursoftware.xyz","source":"books","startedAt":${stretchStartMs.toString()}}}}`,
}

const unendedOf = (fake: ReturnType<typeof fakeDatabase>, nowMs: number) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* TestClock.setTime(nowMs)
      const timeline = yield* makeInstantScribeTimeline(fake.database, {
        origin: 'https://books.pisspoursoftware.xyz',
      })
      return yield* timeline.unendedPlays
    }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
  )

describe('the Instant timeline reporter', () => {
  it('finds the Books plays the account’s recent recordings have a start of and no end', async () => {
    const fake = fakeDatabase({
      recordings: [{ ...liveRecordingRow, activityKind: null }],
      runtimeEvents: [bookStartRow],
    })
    const nowMs = stretchStartMs + 3_600_000
    const plays = await unendedOf(fake, nowMs)
    expect(Array.map(plays, play => [play.playId, play.mediaKey])).toEqual([
      [playId, `audiobook:${lanternKeeper.mediaId}`],
    ])
    expect(
      Array.findFirst(fake.queries, query =>
        JSON.stringify(query).includes('recordingRuntimeEvents'),
      ),
    ).toEqual(
      Option.some({
        recordingRuntimeEvents: {
          $: {
            where: {
              and: [
                { recordingID: { $in: [liveRecordingId] } },
                { kind: 'mediaPlay' },
              ],
            },
            limit: 500,
          },
        },
      }),
    )
  })

  it('writes the end of each play it is told to close', async () => {
    const fake = fakeDatabase({
      recordings: [{ ...liveRecordingRow, activityKind: null }],
      runtimeEvents: [bookStartRow],
    })
    const nowMs = stretchStartMs + 3_600_000
    const [play] = await unendedOf(fake, nowMs)
    const closed = await Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(nowMs)
        const timeline = yield* makeInstantScribeTimeline(fake.database, {
          origin: 'https://books.pisspoursoftware.xyz',
        })
        return yield* timeline.closePlays([
          {
            play: Option.getOrThrow(Option.fromNullishOr(play)),
            mediaEndMs: Milliseconds.make(780_000),
            endedAtMs: stretchStartMs + 30_000,
            reason: 'PageClosed',
          },
        ])
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    )
    expect(closed).toBe(1)
    expect(
      Option.map(Array.head(fake.transactions), steps =>
        Array.map(steps, step => [step.id, step.attrs['timestampSeconds']]),
      ),
    ).toEqual(Option.some([[mediaPlayEventIdOf(playId, 'end'), 630]]))
  })

  it('places a stretch on the account’s live recording and writes its start as the recording’s owner', async () => {
    const fake = fakeDatabase({ recordings: [liveRecordingRow] })
    const result = await reported(fake, began, stretchStartMs + 3_000)
    expect(result).toEqual({ _tag: 'Success', success: 1 })
    expect(fake.transactions.length).toBe(1)
    const step = Option.getOrThrow(
      Option.flatMap(Array.head(fake.transactions), Array.head),
    )
    expect(step.id).toBe(mediaPlayEventIdOf(playId, 'start'))
    expect(step.namespace).toBe('recordingRuntimeEvents')
    expect(step.attrs['ownerUserID']).toBe(appleUser)
    expect(step.attrs['timestampSeconds']).toBe(600)
    expect(step.links).toEqual({ recording: liveRecordingId })
    expect(
      Array.findFirst(fake.queries, query =>
        JSON.stringify(query).includes('"recordings"'),
      ),
    ).toEqual(
      Option.some({
        recordings: {
          $: {
            where: {
              and: [
                { ownerUserID: { $in: [appleUser, emailUser] } },
                { startedAtMs: { $gte: stretchStartMs - 36 * 3_600_000 } },
                { startedAtMs: { $lte: stretchStartMs + 3_000 } },
              ],
            },
            limit: 50,
            fields: [
              'ownerUserID',
              'startedAtMs',
              'durationSeconds',
              'activityKind',
              'deletedAtMs',
              'captureGapsJSON',
            ],
          },
        },
      }),
    )
  })

  it('writes nothing, and says so, when no recording was live while the book played', async () => {
    const fake = fakeDatabase({
      recordings: [
        { ...liveRecordingRow, activityKind: null, durationSeconds: 300 },
      ],
    })
    expect(await reported(fake, began, stretchStartMs + 3_000)).toEqual({
      _tag: 'Success',
      success: 0,
    })
    expect(fake.transactions).toEqual([])
  })

  it('ends from the start Instant already has, writing only the end', async () => {
    const fake = fakeDatabase({
      recordings: [liveRecordingRow],
      runtimeEvents: [
        {
          id: mediaPlayEventIdOf(playId, 'start'),
          kind: 'mediaPlay',
          recordingID: liveRecordingId,
          timestampSeconds: 600,
          capturedAtMs: stretchStartMs,
          payloadJSON:
            '{"mediaPlay":{"_0":{"change":{"started":{}},"mediaStartSeconds":723}}}',
        },
      ],
    })
    expect(await reported(fake, ended, stretchStartMs + 89_500)).toEqual({
      _tag: 'Success',
      success: 1,
    })
    expect(
      Option.map(Array.head(fake.transactions), steps =>
        Array.map(steps, step => step.id),
      ),
    ).toEqual(Option.some([mediaPlayEventIdOf(playId, 'end')]))
    expect(
      Array.findFirst(fake.queries, query =>
        JSON.stringify(query).includes('recordingRuntimeEvents'),
      ),
    ).toEqual(
      Option.some({
        recordingRuntimeEvents: {
          $: { where: { id: { $in: [mediaPlayEventIdOf(playId, 'start')] } } },
        },
      }),
    )
  })

  it('fails with Instant’s words when the write is refused', async () => {
    const fake = fakeDatabase({
      recordings: [liveRecordingRow],
      refuseWrite: 'Permission denied: not perms-pass?',
    })
    expect(await reported(fake, began, stretchStartMs + 3_000)).toEqual({
      _tag: 'Failure',
      failure: expect.objectContaining({
        reason: 'Permission denied: not perms-pass?',
      }),
    })
  })
})
