import { Array, Effect, Layer, Option, Stream, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

import { RecordingListRoute } from './link.js'
import {
  AtLeastCount,
  ExactCount,
  RECORDING_LIST_PAGE_SIZE,
  RECORDING_WINDOW_PAGE_LIMIT,
  type RecordingWindow,
  UnknownCount,
  firstRecordingWindow,
  recordingWindowRangeOf,
} from './listWindow.js'
import {
  ApproachedListEdge,
  ChangedListRowFocus,
  type Message,
  ObservedIdentity,
  ObservedRecordings,
  ReachedListTop,
  UpdatedSearchQuery,
} from './message.js'
import { type Model, SignedIn, SignedOut } from './model.js'
import type { RecordingSummary } from './recording.js'
import {
  WordsStore,
  hasOlderRecordingsOf,
  makeStaticWordsResources,
  recordingListQueryOf,
} from './store.js'
import { observeRecordingWindow, subscriptions } from './subscription.js'
import {
  listPagingOf,
  listedRecordingsOf,
  modelForRoute,
  nextRecordingTitleNumberOf,
  recordingCountOf,
  update,
} from './update.js'

const NEWEST_STARTED_AT_MS = Date.UTC(2026, 8, 30, 12)
const MINUTES_BETWEEN_RECORDINGS = 90
const MILLISECONDS_PER_MINUTE = 60_000

const recordingAt =
  (total: number) =>
  (position: number): RecordingSummary => ({
    id: `recording-${String(position).padStart(4, '0')}`,
    title: `Recording ${total - position}`,
    startedAtMs:
      NEWEST_STARTED_AT_MS -
      position * MINUTES_BETWEEN_RECORDINGS * MILLISECONDS_PER_MINUTE,
    durationSeconds: 60,
    maybeUpdatedAtMs: Option.none(),
    maybeOwnerUserID: Option.none(),
    activity: 'Idle',
    maybeDeviceIcon: Option.none(),
    previewLines: [],
    isLiveRoomSet: false,
    captureGaps: [],
  })

const listOf = (total: number): ReadonlyArray<RecordingSummary> =>
  Array.makeBy(total, recordingAt(total))

const LONG_LIST = listOf(1_000)

const rowsOf = (
  window: RecordingWindow,
  list: ReadonlyArray<RecordingSummary>,
): ReadonlyArray<RecordingSummary> => {
  const { limit, offset } = recordingWindowRangeOf(window)
  return pipe(list, Array.drop(offset), Array.take(limit))
}

const snapshotOf = (
  window: RecordingWindow,
  list: ReadonlyArray<RecordingSummary>,
) => {
  const { limit, offset } = recordingWindowRangeOf(window)
  return ObservedRecordings({
    window,
    recordings: rowsOf(window, list),
    skippedCount: 0,
    maybeSkippedReason: Option.none(),
    hasOlder: offset + limit < Array.length(list),
  })
}

const run = (model: Model, messages: ReadonlyArray<Message>) =>
  Array.reduce(
    messages,
    { model, requestedWindows: Array.empty<RecordingWindow>() },
    (state, message) => {
      const [next] = update(state.model, message)
      return {
        model: next,
        requestedWindows:
          next.recordingWindow === state.model.recordingWindow
            ? state.requestedWindows
            : [...state.requestedWindows, next.recordingWindow],
      }
    },
  )

const loadedOf = (model: Model) => {
  if (model.recordings._tag === 'LoadedRecordings') {
    return model.recordings
  } else {
    throw new Error(`Expected LoadedRecordings, got ${model.recordings._tag}`)
  }
}

const firstLoaded = (list: ReadonlyArray<RecordingSummary> = LONG_LIST) =>
  run(modelForRoute(RecordingListRoute()), [
    snapshotOf(firstRecordingWindow, list),
  ]).model

const approach = (model: Model, edge: 'Newer' | 'Older'): Model =>
  run(model, [ApproachedListEdge({ edge, window: loadedOf(model).window })])
    .model

const settle = (
  model: Model,
  list: ReadonlyArray<RecordingSummary> = LONG_LIST,
): Model => run(model, [snapshotOf(model.recordingWindow, list)]).model

const scrolledOlder = (model: Model, steps: number): Model =>
  Array.reduce(Array.range(1, steps), model, current =>
    settle(approach(current, 'Older')),
  )

const idsOf = (rows: ReadonlyArray<RecordingSummary>): ReadonlyArray<string> =>
  Array.map(rows, row => row.id)

describe('loading the list as it scrolls', () => {
  it('asks for the next page when the older edge comes near, growing to three pages', () => {
    const start = firstLoaded()
    expect(listPagingOf(start)).toBe('Settled')
    expect(loadedOf(start).olderEdge).toBe('MoreToLoad')

    const asked = run(start, [
      ApproachedListEdge({ edge: 'Older', window: firstRecordingWindow }),
    ])
    expect(asked.requestedWindows).toEqual([{ firstPage: 0, pageCount: 2 }])
    expect(listPagingOf(asked.model)).toBe('LoadingOlder')

    const twoPages = settle(asked.model)
    expect(listPagingOf(twoPages)).toBe('Settled')
    expect(Array.length(loadedOf(twoPages).recordings)).toBe(200)

    const threePages = settle(approach(twoPages, 'Older'))
    expect(loadedOf(threePages).window).toEqual({ firstPage: 0, pageCount: 3 })
    expect(Array.length(loadedOf(threePages).recordings)).toBe(300)
  })

  it('slides past three pages, dropping the newest page, and never keeps more than three', () => {
    const slid = scrolledOlder(firstLoaded(), 3)
    expect(loadedOf(slid).window).toEqual({ firstPage: 1, pageCount: 3 })
    expect(
      Option.map(Array.head(loadedOf(slid).recordings), row => row.id),
    ).toEqual(Option.some('recording-0100'))

    const deep = Array.reduce(Array.range(1, 12), slid, (model, step) => {
      const next = settle(approach(model, 'Older'))
      const loaded = loadedOf(next)
      expect(loaded.window.pageCount).toBeLessThanOrEqual(
        RECORDING_WINDOW_PAGE_LIMIT,
      )
      expect(Array.length(listedRecordingsOf(loaded))).toBeLessThanOrEqual(
        RECORDING_WINDOW_PAGE_LIMIT * RECORDING_LIST_PAGE_SIZE,
      )
      expect(loaded.window.firstPage).toBe(Math.min(1 + step, 7))
      return next
    })
    expect(loadedOf(deep).window).toEqual({ firstPage: 7, pageCount: 3 })
    expect(loadedOf(deep).olderEdge).toBe('EndOfList')
  })

  it('asks for the newer page when a slid window’s newer edge comes near', () => {
    const slid = scrolledOlder(firstLoaded(), 4)
    expect(loadedOf(slid).window).toEqual({ firstPage: 2, pageCount: 3 })

    const asked = run(slid, [
      ApproachedListEdge({ edge: 'Newer', window: loadedOf(slid).window }),
    ])
    expect(asked.requestedWindows).toEqual([{ firstPage: 1, pageCount: 3 }])
    expect(listPagingOf(asked.model)).toBe('LoadingNewer')

    const back = settle(asked.model)
    expect(
      Option.map(Array.head(loadedOf(back).recordings), row => row.id),
    ).toEqual(Option.some('recording-0100'))

    const top = settle(approach(back, 'Newer'))
    expect(loadedOf(top).window).toEqual({ firstPage: 0, pageCount: 3 })
    expect(
      run(top, [
        ApproachedListEdge({ edge: 'Newer', window: loadedOf(top).window }),
      ]).requestedWindows,
    ).toEqual([])
  })

  it('asks for nothing while a page is loading', () => {
    const loading = approach(firstLoaded(), 'Older')
    expect(listPagingOf(loading)).toBe('LoadingOlder')

    const whileLoading = run(loading, [
      ApproachedListEdge({ edge: 'Older', window: firstRecordingWindow }),
      ApproachedListEdge({ edge: 'Newer', window: firstRecordingWindow }),
      ApproachedListEdge({
        edge: 'Older',
        window: { firstPage: 0, pageCount: 2 },
      }),
      ReachedListTop({ window: firstRecordingWindow }),
    ])
    expect(whileLoading.requestedWindows).toEqual([])
    expect(whileLoading.model.recordingWindow).toEqual({
      firstPage: 0,
      pageCount: 2,
    })

    const slidLoading = approach(scrolledOlder(firstLoaded(), 4), 'Newer')
    expect(
      run(slidLoading, [
        ApproachedListEdge({
          edge: 'Newer',
          window: { firstPage: 2, pageCount: 3 },
        }),
        ApproachedListEdge({
          edge: 'Older',
          window: { firstPage: 2, pageCount: 3 },
        }),
        ReachedListTop({ window: { firstPage: 2, pageCount: 3 } }),
      ]).requestedWindows,
    ).toEqual([])
  })

  it('asks at most once for each edge of a window', () => {
    const start = firstLoaded()
    const nearOld = ApproachedListEdge({
      edge: 'Older',
      window: firstRecordingWindow,
    })
    const flurry = run(start, [
      nearOld,
      nearOld,
      nearOld,
      snapshotOf({ firstPage: 0, pageCount: 2 }, LONG_LIST),
      nearOld,
      nearOld,
      ReachedListTop({ window: firstRecordingWindow }),
    ])
    expect(flurry.requestedWindows).toEqual([{ firstPage: 0, pageCount: 2 }])
    expect(listPagingOf(flurry.model)).toBe('Settled')
  })

  it('ignores a snapshot of a window it no longer asks for', () => {
    const loading = approach(firstLoaded(), 'Older')
    const withNewRecording = listOf(1_001)
    const late = run(loading, [
      snapshotOf(firstRecordingWindow, withNewRecording),
    ])
    expect(late.model).toEqual(loading)
    expect(listPagingOf(late.model)).toBe('LoadingOlder')
    expect(idsOf(loadedOf(late.model).recordings)).toEqual(
      idsOf(rowsOf(firstRecordingWindow, LONG_LIST)),
    )
  })

  it('stops at a page that adds nothing, even when the server keeps saying there is more', () => {
    const stuck = (window: RecordingWindow) =>
      ObservedRecordings({
        window,
        recordings: rowsOf(firstRecordingWindow, LONG_LIST),
        skippedCount: 0,
        maybeSkippedReason: Option.none(),
        hasOlder: true,
      })
    const start = run(modelForRoute(RecordingListRoute()), [
      stuck(firstRecordingWindow),
    ]).model
    const twoPages = { firstPage: 0, pageCount: 2 }
    const nearTwo = ApproachedListEdge({ edge: 'Older', window: twoPages })
    const session = run(start, [
      ApproachedListEdge({ edge: 'Older', window: firstRecordingWindow }),
      stuck(twoPages),
      ...Array.flatten(Array.makeBy(20, () => [nearTwo, stuck(twoPages)])),
    ])
    expect(session.requestedWindows).toEqual([twoPages])
    expect(loadedOf(session.model).olderEdge).toBe('NothingAdded')
    expect(listPagingOf(session.model)).toBe('Settled')
  })

  it('stops at the end of the list', () => {
    const shortList = listOf(150)
    const end = settle(approach(firstLoaded(shortList), 'Older'), shortList)
    expect(Array.length(loadedOf(end).recordings)).toBe(150)
    expect(loadedOf(end).olderEdge).toBe('EndOfList')
    expect(
      run(end, [
        ApproachedListEdge({ edge: 'Older', window: loadedOf(end).window }),
      ]).requestedWindows,
    ).toEqual([])
  })

  it('goes back to the newest page from the very top of a slid list', () => {
    const slid = scrolledOlder(firstLoaded(), 5)
    const top = run(slid, [ReachedListTop({ window: loadedOf(slid).window })])
    expect(top.requestedWindows).toEqual([firstRecordingWindow])
    expect(listPagingOf(top.model)).toBe('LoadingNewer')
    expect(idsOf(loadedOf(settle(top.model)).recordings)).toEqual(
      idsOf(rowsOf(firstRecordingWindow, LONG_LIST)),
    )
    expect(
      run(firstLoaded(), [ReachedListTop({ window: firstRecordingWindow })])
        .requestedWindows,
    ).toEqual([])
  })

  it('keeps the row that holds keyboard focus when its page leaves the list', () => {
    const focusedRow = recordingAt(1_000)(5)
    const focused = run(scrolledOlder(firstLoaded(), 2), [
      ChangedListRowFocus({ maybeRecordingID: Option.some(focusedRow.id) }),
    ]).model
    const slid = settle(approach(focused, 'Older'))
    const listed = listedRecordingsOf(loadedOf(slid))
    expect(Array.head(listed)).toEqual(Option.some(focusedRow))
    expect(Array.length(listed)).toBe(301)
    expect(Array.length(loadedOf(slid).recordings)).toBe(300)
    const slidAgain = listedRecordingsOf(
      loadedOf(settle(approach(slid, 'Older'))),
    )
    expect(Array.head(slidAgain)).toEqual(Option.some(focusedRow))
    expect(Array.length(slidAgain)).toBe(301)

    const blurred = run(slid, [
      ChangedListRowFocus({ maybeRecordingID: Option.none() }),
    ]).model
    expect(Array.length(listedRecordingsOf(loadedOf(blurred)))).toBe(300)
    expect(
      Array.some(
        listedRecordingsOf(loadedOf(blurred)),
        row => row.id === focusedRow.id,
      ),
    ).toBe(false)
  })

  it('grows the window during a search but never slides it, so results stay put', () => {
    const searching = run(firstLoaded(), [
      UpdatedSearchQuery({ query: 'Recording 9' }),
    ]).model
    const grown = scrolledOlder(searching, 2)
    expect(loadedOf(grown).window).toEqual({ firstPage: 0, pageCount: 3 })
    expect(
      run(grown, [
        ApproachedListEdge({ edge: 'Older', window: loadedOf(grown).window }),
      ]).requestedWindows,
    ).toEqual([])

    const slid = run(scrolledOlder(firstLoaded(), 4), [
      UpdatedSearchQuery({ query: 'Recording 9' }),
    ]).model
    expect(
      run(slid, [
        ApproachedListEdge({ edge: 'Newer', window: loadedOf(slid).window }),
        ApproachedListEdge({ edge: 'Older', window: loadedOf(slid).window }),
      ]).requestedWindows,
    ).toEqual([])
    expect(
      run(slid, [ReachedListTop({ window: loadedOf(slid).window })])
        .requestedWindows,
    ).toEqual([firstRecordingWindow])
  })

  it('names a count only when it knows one', () => {
    expect(recordingCountOf(modelForRoute(RecordingListRoute()))).toEqual(
      UnknownCount(),
    )
    expect(recordingCountOf(firstLoaded())).toEqual(
      AtLeastCount({ count: 100 }),
    )
    const shortList = listOf(150)
    expect(
      recordingCountOf(
        settle(approach(firstLoaded(shortList), 'Older'), shortList),
      ),
    ).toEqual(ExactCount({ count: 150 }))
    expect(recordingCountOf(scrolledOlder(firstLoaded(), 3))).toEqual(
      UnknownCount(),
    )
  })

  it('numbers a new recording past the newest one after the newest page leaves', () => {
    const start = firstLoaded()
    expect(nextRecordingTitleNumberOf(start)).toEqual(Option.some(1_001))
    const slid = scrolledOlder(start, 5)
    expect(loadedOf(slid).window).toEqual({ firstPage: 3, pageCount: 3 })
    expect(nextRecordingTitleNumberOf(slid)).toEqual(Option.some(1_001))
  })

  it('starts again from the newest page for another account', () => {
    const slid = scrolledOlder(firstLoaded(), 4)
    expect(slid.recordingWindow).toEqual({ firstPage: 2, pageCount: 3 })
    const otherAccount = run(slid, [
      ObservedIdentity({
        identity: SignedIn({
          userID: 'another-user',
          maybeEmail: Option.some('another@example.com'),
          isGuest: false,
        }),
      }),
    ]).model
    expect(otherAccount.recordingWindow).toEqual(firstRecordingWindow)
    expect(otherAccount.recordings._tag).toBe('LoadingRecordings')
  })
})

describe('asking Instant for a list window', () => {
  it('asks for the window’s pages newest first, and no offset for the first page', () => {
    expect(recordingListQueryOf({ firstPage: 2, pageCount: 3 })).toEqual({
      recordings: {
        $: { order: { startedAtMs: 'desc' }, limit: 300, offset: 200 },
        previewSegmentA: {},
        previewSegmentB: {},
      },
    })
    expect(recordingListQueryOf(firstRecordingWindow)).toEqual({
      recordings: {
        $: { order: { startedAtMs: 'desc' }, limit: 100 },
        previewSegmentA: {},
        previewSegmentB: {},
      },
    })
  })

  it('trusts the server’s next-page answer, and a full window when there is none', () => {
    const window = { firstPage: 0, pageCount: 1 }
    expect(hasOlderRecordingsOf(48, window, Option.some(true))).toBe(true)
    expect(hasOlderRecordingsOf(100, window, Option.some(false))).toBe(false)
    expect(hasOlderRecordingsOf(100, window, Option.none())).toBe(true)
    expect(hasOlderRecordingsOf(48, window, Option.none())).toBe(false)
  })

  it('observes the window the Model asks for and tags each snapshot with it', async () => {
    const slid = scrolledOlder(firstLoaded(), 4)
    const recordingsSubscription = subscriptions['recordings']
    if (recordingsSubscription === undefined) {
      throw new Error('Expected a recordings Subscription')
    }
    expect(recordingsSubscription.modelToDependencies(slid)).toEqual({
      window: { firstPage: 2, pageCount: 3 },
      maybeUserID: Option.none(),
    })

    const askedFor: Array<RecordingWindow> = []
    const staticStore = Effect.runSync(
      WordsStore.pipe(
        Effect.provide(
          makeStaticWordsResources(
            SignedOut(),
            {
              recordings: [],
              skipped: { count: 0, maybeFirstReason: Option.none() },
            },
            {},
          ),
        ),
      ),
    )
    const store = Layer.succeed(WordsStore, {
      ...staticStore,
      observeRecordings: window => {
        askedFor.push(window)
        return Stream.succeed({
          recordings: rowsOf(window, LONG_LIST),
          skipped: { count: 0, maybeFirstReason: Option.none() },
          hasOlder: true,
        })
      },
    })
    const window = { firstPage: 2, pageCount: 3 }
    const messages = await Effect.runPromise(
      observeRecordingWindow(window).pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.provide(store),
      ),
    )
    expect(askedFor).toEqual([window])
    expect(messages).toEqual([
      ObservedRecordings({
        window,
        recordings: rowsOf(window, LONG_LIST),
        skippedCount: 0,
        maybeSkippedReason: Option.none(),
        hasOlder: true,
      }),
    ])
  })
})
