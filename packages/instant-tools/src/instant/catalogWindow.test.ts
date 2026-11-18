import { Array, Effect, Fiber, Option, Stream } from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import { ApplicationProduct, Issue, IssueQuery } from '../issues/index.js'
import {
  CHANGED_ISSUES_OVERLAP_MS,
  type InstantToolsDatabase,
  type IssueCatalogCache,
  type KeptIssueCatalog,
  makeInstantEntityStore,
  makeInstantIssueRecord,
  makeIssueTracker,
} from './instant.js'

const FILED_AT_MS = 1_793_000_000_000

const issueAt = (id: string, updatedAtMs: number, title = `Issue ${id}`) =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: FILED_AT_MS,
    details: '',
    evidenceLogQueries: [],
    id,
    issueType: Option.none(),
    mentions: [],
    priority: 'P2',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'Open',
    successCriteria: [],
    title,
    updatedAtMs,
    viewerURL: Option.none(),
    workLog: [],
  })

const rowOf = (issue: Issue) => {
  const record = makeInstantIssueRecord(issue)
  return { ...record, id: `row-${issue.id}` }
}

type Row = ReturnType<typeof rowOf>
type Listener = (response: { data: { instantToolsIssues: unknown } }) => void
type Live = { query: unknown; listen: Listener; isOpen: boolean }

const makeDatabase = (rows: ReadonlyArray<Row>) => {
  const once: Array<unknown> = []
  const live: Array<Live> = []
  const database = {
    queryOnce: (query: unknown) => {
      once.push(query)
      return Promise.resolve({ data: { instantToolsIssues: rows } })
    },
    subscribeQuery: (query: unknown, listen: Listener) => {
      const entry: Live = { query, listen, isOpen: true }
      live.push(entry)
      return () => {
        entry.isOpen = false
      }
    },
  }
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions
    database: database as unknown as InstantToolsDatabase,
    live,
    once,
  }
}

const every = IssueQuery.make({
  limit: 2_000,
  productId: Option.none(),
  projectId: Option.none(),
  statuses: [],
})

const isIdList = (entry: Live): boolean =>
  JSON.stringify(entry.query).includes('fields')

const windowOf = (live: ReadonlyArray<Live>): Live =>
  Option.getOrThrow(
    Array.findLast(live, entry => entry.isOpen && !isIdList(entry)),
  )

const idListOf = (live: ReadonlyArray<Live>): Live =>
  Option.getOrThrow(Array.findFirst(live, isIdList))

const answer = (rows: ReadonlyArray<unknown>) => ({
  data: { instantToolsIssues: rows },
})

const ATTEMPTS = 400

const until = (isDone: () => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < ATTEMPTS && !isDone(); attempt += 1) {
      yield* Effect.sleep('5 millis')
    }
  })

const collect = (
  tracker: ReturnType<typeof makeIssueTracker>,
  live: ReadonlyArray<Live>,
) =>
  Effect.gen(function* () {
    const seen: Array<ReadonlyArray<Issue>> = []
    const fiber = yield* tracker.observe(every).pipe(
      Stream.runForEach(issues =>
        Effect.sync(() => {
          seen.push(issues)
        }),
      ),
      Effect.forkChild,
    )
    yield* until(() => live.length >= 2 && seen.length >= 1)
    return { fiber, seen }
  })

const titlesOf = (issues: ReadonlyArray<Issue>): ReadonlyArray<string> =>
  Array.map(issues, issue => `${issue.id}:${issue.title}`)

/** Waits for one more snapshot after what `seen` holds now. */
const nextSnapshot = (seen: ReadonlyArray<ReadonlyArray<Issue>>) => {
  const count = seen.length
  return until(() => seen.length > count)
}

describe('the live catalog', () => {
  it.live('reads the whole catalog once, then only what changed since', () =>
    Effect.gen(function* () {
      const rows = [
        rowOf(issueAt('001', FILED_AT_MS)),
        rowOf(issueAt('002', FILED_AT_MS + 5_000)),
      ]
      const { database, live, once } = makeDatabase(rows)
      const tracker = makeIssueTracker(makeInstantEntityStore(database))
      const { fiber, seen } = yield* collect(tracker, live)

      expect(once).toEqual([{ instantToolsIssues: {} }])
      expect(seen).toHaveLength(1)
      expect(windowOf(live).query).toEqual({
        instantToolsIssues: {
          $: {
            where: {
              updatedAtMs: {
                $gte: FILED_AT_MS + 5_000 - CHANGED_ISSUES_OVERLAP_MS,
              },
            },
          },
        },
      })
      expect(idListOf(live).query).toEqual({
        instantToolsIssues: { $: { fields: ['issueID'] } },
      })
      yield* Fiber.interrupt(fiber)
    }),
  )

  it.live(
    'a change to one Issue arrives whole, and the others keep their value',
    () =>
      Effect.gen(function* () {
        const first = rowOf(issueAt('001', FILED_AT_MS))
        const second = rowOf(issueAt('002', FILED_AT_MS + 5_000))
        const { database, live } = makeDatabase([first, second])
        const tracker = makeIssueTracker(makeInstantEntityStore(database))
        const { fiber, seen } = yield* collect(tracker, live)

        const changed = rowOf(issueAt('002', FILED_AT_MS + 9_000, 'Renamed'))
        const changedArrived = nextSnapshot(seen)
        windowOf(live).listen(answer([changed]))
        yield* changedArrived

        const latest = Option.getOrThrow(Array.last(seen))
        expect(titlesOf(latest)).toEqual(['002:Renamed', '001:Issue 001'])
        const before = Option.getOrThrow(Array.head(seen))
        expect(latest.find(issue => issue.id === '001')).toBe(
          before.find(issue => issue.id === '001'),
        )
        yield* Fiber.interrupt(fiber)
      }),
  )

  it.live('a new Issue appears at once, before the id list says so', () =>
    Effect.gen(function* () {
      const { database, live } = makeDatabase([
        rowOf(issueAt('001', FILED_AT_MS)),
      ])
      const tracker = makeIssueTracker(makeInstantEntityStore(database))
      const { fiber, seen } = yield* collect(tracker, live)

      const listArrived = nextSnapshot(seen)
      idListOf(live).listen(answer([{ id: 'row-001', issueID: '001' }]))
      yield* listArrived
      const newArrived = nextSnapshot(seen)
      windowOf(live).listen(answer([rowOf(issueAt('002', FILED_AT_MS + 1))]))
      yield* newArrived

      expect(titlesOf(Option.getOrThrow(Array.last(seen)))).toEqual([
        '002:Issue 002',
        '001:Issue 001',
      ])
      yield* Fiber.interrupt(fiber)
    }),
  )

  it.live('a deleted Issue leaves when the id list no longer holds it', () =>
    Effect.gen(function* () {
      const { database, live } = makeDatabase([
        rowOf(issueAt('001', FILED_AT_MS)),
        rowOf(issueAt('002', FILED_AT_MS + 1)),
      ])
      const tracker = makeIssueTracker(makeInstantEntityStore(database))
      const { fiber, seen } = yield* collect(tracker, live)

      const listArrived = nextSnapshot(seen)
      idListOf(live).listen(answer([{ id: 'row-002', issueID: '002' }]))
      yield* listArrived

      expect(titlesOf(Option.getOrThrow(Array.last(seen)))).toEqual([
        '002:Issue 002',
      ])
      yield* Fiber.interrupt(fiber)
    }),
  )

  it.live(
    'moves its window forward as changes pile up, and keeps what it saw',
    () =>
      Effect.gen(function* () {
        const { database, live } = makeDatabase([
          rowOf(issueAt('001', FILED_AT_MS)),
        ])
        const tracker = makeIssueTracker(makeInstantEntityStore(database))
        const { fiber, seen } = yield* collect(tracker, live)
        const firstWindow = windowOf(live)

        const changes = Array.makeBy(9, index =>
          rowOf(issueAt(`1${index.toString()}`, FILED_AT_MS + 100 + index)),
        )
        const changesArrived = nextSnapshot(seen)
        firstWindow.listen(answer(changes))
        yield* changesArrived

        expect(firstWindow.isOpen).toBe(false)
        expect(windowOf(live).query).toEqual({
          instantToolsIssues: {
            $: {
              where: {
                updatedAtMs: {
                  $gte: FILED_AT_MS + 108 - CHANGED_ISSUES_OVERLAP_MS,
                },
              },
            },
          },
        })
        const movedArrived = nextSnapshot(seen)
        windowOf(live).listen(answer([]))
        yield* movedArrived
        expect(Option.getOrThrow(Array.last(seen))).toHaveLength(10)
        yield* Fiber.interrupt(fiber)
      }),
  )

  it.live('stays in one window for a burst of changes inside the overlap', () =>
    Effect.gen(function* () {
      const { database, live } = makeDatabase([
        rowOf(issueAt('001', FILED_AT_MS)),
      ])
      const tracker = makeIssueTracker(makeInstantEntityStore(database))
      const { fiber, seen } = yield* collect(tracker, live)
      const burst = Array.makeBy(12, index =>
        rowOf(issueAt(`2${index.toString()}`, FILED_AT_MS + 1_000 + index)),
      )

      const burstArrived = nextSnapshot(seen)
      windowOf(live).listen(answer(burst))
      yield* burstArrived
      const opened = live.length
      const repeatedArrived = nextSnapshot(seen)
      windowOf(live).listen(answer(burst))
      yield* repeatedArrived

      expect(live.length).toBe(opened)
      expect(Option.getOrThrow(Array.last(seen))).toHaveLength(13)
      yield* Fiber.interrupt(fiber)
    }),
  )

  it.live(
    'opens a window whose answer arrives at once, and closes it once',
    () =>
      Effect.gen(function* () {
        const rows = [rowOf(issueAt('001', FILED_AT_MS))]
        const opened: Array<{ isOpen: boolean }> = []
        const cached = Array.makeBy(10, index =>
          rowOf(issueAt(`3${index.toString()}`, FILED_AT_MS + 5_000 + index)),
        )
        const database = {
          queryOnce: () =>
            Promise.resolve({ data: { instantToolsIssues: rows } }),
          subscribeQuery: (query: unknown, listen: Listener) => {
            const isIds = JSON.stringify(query).includes('fields')
            const entry = { isOpen: true }
            if (!isIds) {
              opened.push(entry)
              if (opened.length === 1) {
                listen(answer(cached))
              }
            }
            return () => {
              entry.isOpen = false
            }
          },
        }
        const tracker = makeIssueTracker(
          makeInstantEntityStore(
            // oxlint-disable-next-line typescript/consistent-type-assertions
            database as unknown as InstantToolsDatabase,
          ),
        )
        const fiber = yield* tracker
          .observe(every)
          .pipe(Stream.runDrain, Effect.forkChild)
        yield* until(() => opened.length >= 2)
        expect(Array.map(opened, entry => entry.isOpen)).toEqual([false, true])
        yield* Fiber.interrupt(fiber)
        expect(Array.map(opened, entry => entry.isOpen)).toEqual([false, false])
      }),
  )

  it.live('closes every live query when no one observes', () =>
    Effect.gen(function* () {
      const { database, live } = makeDatabase([
        rowOf(issueAt('001', FILED_AT_MS)),
      ])
      const tracker = makeIssueTracker(makeInstantEntityStore(database))
      const { fiber } = yield* collect(tracker, live)
      yield* Fiber.interrupt(fiber)
      expect(Array.filter(live, entry => entry.isOpen)).toEqual([])
    }),
  )

  it.live('fails the stream with the reason when a live query fails', () =>
    Effect.gen(function* () {
      const { database, live } = makeDatabase([
        rowOf(issueAt('001', FILED_AT_MS)),
      ])
      const tracker = makeIssueTracker(makeInstantEntityStore(database))
      const exit = yield* Effect.exit(
        tracker.observe(every).pipe(
          Stream.tap(() =>
            Effect.sync(() => {
              const open = live.find(entry => entry.isOpen && !isIdList(entry))
              if (open !== undefined) {
                // oxlint-disable-next-line typescript/consistent-type-assertions
                ;(open.listen as (response: unknown) => void)({
                  error: { message: 'Permission denied' },
                })
              }
            }),
          ),
          Stream.runDrain,
          Effect.timeout('500 millis'),
        ),
      )
      expect(exit._tag).toBe('Failure')
    }),
  )
})

describe('saving an Issue', () => {
  it.live('marks the row as changed now, whatever the Issue says', () =>
    Effect.gen(function* () {
      const writes: Array<Readonly<Record<string, unknown>>> = []
      const database = {
        transact: (write: Readonly<Record<string, unknown>>) => {
          writes.push(write)
          return Promise.resolve()
        },
        tx: {
          instantToolsIssues: {
            lookup: () => ({
              update: (fields: Readonly<Record<string, unknown>>) => fields,
            }),
          },
        },
      }
      const store = makeInstantEntityStore(
        // oxlint-disable-next-line typescript/consistent-type-assertions
        database as unknown as InstantToolsDatabase,
      )
      yield* store.saveIssue(
        makeInstantIssueRecord(issueAt('001', 5)),
        Option.none(),
      )
      expect(writes[0]?.['updatedAtMs']).toBeGreaterThan(5)
    }),
  )
})

describe('a catalog kept between visits', () => {
  const memoryCache = (kept: Option.Option<KeptIssueCatalog>) => {
    const changed: Array<ReadonlyArray<string>> = []
    const forgotten: Array<ReadonlyArray<string>> = []
    const allAt: Array<number> = []
    const cache: IssueCatalogCache = {
      read: () => Promise.resolve(kept),
      rememberAll: (records, atMs) => {
        allAt.push(atMs)
        changed.push(Array.map(records, record => record.issueID))
      },
      rememberChanged: records => {
        changed.push(Array.map(records, record => record.issueID))
      },
      forget: rowIds => {
        forgotten.push(rowIds)
      },
    }
    return { allAt, cache, changed, forgotten }
  }

  it.live(
    'shows what it kept and reads only what changed since, with no full read',
    () =>
      Effect.gen(function* () {
        const newest = Date.now() - 5_000
        const kept = [
          rowOf(issueAt('001', newest - 9_000)),
          rowOf(issueAt('002', newest)),
        ]
        const { cache, changed } = memoryCache(
          Option.some({ fullReadAtMs: Date.now() - 60_000, records: kept }),
        )
        const { database, live, once } = makeDatabase([])
        const tracker = makeIssueTracker(
          makeInstantEntityStore(database, cache),
        )
        const { fiber, seen } = yield* collect(tracker, live)

        expect(once).toEqual([])
        expect(titlesOf(Option.getOrThrow(Array.head(seen)))).toEqual([
          '002:Issue 002',
          '001:Issue 001',
        ])
        expect(windowOf(live).query).toEqual({
          instantToolsIssues: {
            $: {
              where: {
                updatedAtMs: { $gte: newest - CHANGED_ISSUES_OVERLAP_MS },
              },
            },
          },
        })

        const arrived = nextSnapshot(seen)
        windowOf(live).listen(
          answer([rowOf(issueAt('002', newest + 1, 'New'))]),
        )
        yield* arrived
        expect(changed).toEqual([['002']])
        yield* Fiber.interrupt(fiber)
      }),
  )

  it.live(
    'reads everything when what it kept does not answer within two seconds',
    () =>
      Effect.gen(function* () {
        const { cache } = memoryCache(Option.none())
        const silent = { ...cache, read: () => new Promise<never>(() => {}) }
        const { database, once } = makeDatabase([
          rowOf(issueAt('001', FILED_AT_MS)),
        ])
        const tracker = makeIssueTracker(
          makeInstantEntityStore(database, silent),
        )
        const seen: Array<ReadonlyArray<Issue>> = []
        const fiber = yield* tracker.observe(every).pipe(
          Stream.runForEach(issues =>
            Effect.sync(() => {
              seen.push(issues)
            }),
          ),
          Effect.forkChild,
        )
        for (let waited = 0; waited < 100 && seen.length === 0; waited += 1) {
          yield* Effect.sleep('50 millis')
        }

        expect(once).toHaveLength(1)
        expect(titlesOf(Option.getOrThrow(Array.head(seen)))).toEqual([
          '001:Issue 001',
        ])
        yield* Fiber.interrupt(fiber)
      }),
    10_000,
  )

  it.live('reads everything when nothing was kept, and keeps it', () =>
    Effect.gen(function* () {
      const { allAt, cache, changed } = memoryCache(Option.none())
      const { database, live, once } = makeDatabase([
        rowOf(issueAt('001', FILED_AT_MS)),
      ])
      const tracker = makeIssueTracker(makeInstantEntityStore(database, cache))
      const { fiber } = yield* collect(tracker, live)

      expect(once).toEqual([{ instantToolsIssues: {} }])
      expect(allAt).toHaveLength(1)
      expect(changed).toEqual([['001']])
      yield* Fiber.interrupt(fiber)
    }),
  )

  it.live('reads everything once a day, whatever it kept', () =>
    Effect.gen(function* () {
      const { allAt, cache } = memoryCache(
        Option.some({
          fullReadAtMs: Date.now() - 25 * 60 * 60 * 1_000,
          records: [rowOf(issueAt('009', FILED_AT_MS))],
        }),
      )
      const { database, live, once } = makeDatabase([
        rowOf(issueAt('001', FILED_AT_MS)),
      ])
      const tracker = makeIssueTracker(makeInstantEntityStore(database, cache))
      const { fiber, seen } = yield* collect(tracker, live)

      expect(once).toHaveLength(1)
      expect(allAt).toHaveLength(1)
      expect(titlesOf(Option.getOrThrow(Array.head(seen)))).toEqual([
        '001:Issue 001',
      ])
      yield* Fiber.interrupt(fiber)
    }),
  )

  it.live('forgets an Issue the id list no longer holds', () =>
    Effect.gen(function* () {
      const newest = Date.now() - 5_000
      const { cache, forgotten } = memoryCache(
        Option.some({
          fullReadAtMs: Date.now() - 60_000,
          records: [
            rowOf(issueAt('001', newest - 9_000)),
            rowOf(issueAt('002', newest)),
          ],
        }),
      )
      const { database, live } = makeDatabase([])
      const tracker = makeIssueTracker(makeInstantEntityStore(database, cache))
      const { fiber, seen } = yield* collect(tracker, live)

      const arrived = nextSnapshot(seen)
      idListOf(live).listen(answer([{ id: 'row-002', issueID: '002' }]))
      yield* arrived
      expect(forgotten).toEqual([['row-001']])
      yield* Fiber.interrupt(fiber)
    }),
  )

  it.live('treats a catalog it cannot read as nothing kept', () =>
    Effect.gen(function* () {
      const { allAt, cache } = memoryCache(Option.none())
      const refusing: IssueCatalogCache = {
        ...cache,
        read: () => Promise.reject(new Error('Storage is full')),
      }
      const { database, live, once } = makeDatabase([
        rowOf(issueAt('001', FILED_AT_MS)),
      ])
      const tracker = makeIssueTracker(
        makeInstantEntityStore(database, refusing),
      )
      const { fiber } = yield* collect(tracker, live)
      expect(once).toHaveLength(1)
      expect(allAt).toHaveLength(1)
      yield* Fiber.interrupt(fiber)
    }),
  )
})
