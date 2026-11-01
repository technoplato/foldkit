import { Array, Effect, Option } from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'
import { InstantAPIError, getOps, txInit } from '@instantdb/core'

import {
  ApplicationProduct,
  Issue,
  IssueWorkLogEntry,
  describeIssueTrackerError,
} from '../issues/index.js'
import {
  type InstantIssueRecord,
  type InstantToolsDatabase,
  InstantToolsSchema,
  type IssueWriteTiming,
  decodeIssueRecord,
  makeInstantEntityStore,
  makeInstantIssueRecord,
  makeIssueTracker,
} from './instant.js'

const storedIssue = Issue.make({
  area: Option.none(),
  attachments: [],
  claimantId: Option.none(),
  complexity: Option.none(),
  createdAtMs: 1_000,
  details: 'Two agents log on one Issue at once.',
  id: '005',
  issueType: Option.none(),
  mentions: [],
  priority: 'P1',
  product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
  projectId: Option.none(),
  reportedDate: Option.none(),
  sourceDocument: Option.none(),
  status: 'InProgress',
  successCriteria: [],
  title: 'Every entry two writers log is stored',
  updatedAtMs: 5_000,
  viewerURL: Option.none(),
  workLog: [],
})

const storedRecord: InstantIssueRecord = {
  ...makeInstantIssueRecord(storedIssue),
  id: 'entity-005',
}

const quick: IssueWriteTiming = { retryMs: 1, settleMs: 0 }

type Rule = 'Owner' | 'NotOwner'

type ServerOptions = Readonly<{
  /** How long a transaction takes between its judgment and its commit. */
  commitDelayMs: () => number
  rule: Rule
  /** Instant only queued the write: the client was offline. */
  isOffline: boolean
}>

const ownerServer: ServerOptions = {
  commitDelayMs: () => 0,
  isOffline: false,
  rule: 'Owner',
}

type Read = Readonly<{ query: unknown; options: unknown }>

const permissionDenied = () =>
  new InstantAPIError({
    status: 400,
    body: {
      type: 'permission-denied',
      message: 'Permission denied: not perms-pass?',
      hint: { expected: 'perms-pass?', input: null },
    },
  })

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

/**
 * A fake of Instant's server for one Issue row. Like the real one, it judges a
 * transaction's update rule against the row as it stands when the transaction
 * starts and commits it later, so two transactions that start before either
 * commits both pass: the rule is no lock. `ruleParams.expectedUpdatedAtMs`,
 * when sent, must equal the stored `updatedAtMs`.
 */
const makeServer = (options: ServerOptions = ownerServer) => {
  let row = storedRecord
  const reads: Array<Read> = []
  const sentRuleParams: Array<unknown> = []
  const afterNextRead: Array<() => void> = []
  const database = {
    tx: txInit<typeof InstantToolsSchema>(),
    queryOnce: (query: unknown, queryOptions?: unknown) => {
      reads.push({ query, options: queryOptions })
      const answer = { data: { instantToolsIssues: [row] } }
      const hooks = afterNextRead.splice(0)
      for (const hook of hooks) {
        hook()
      }
      return Promise.resolve(answer)
    },
    subscribeQuery: () => () => undefined,
    transact: async (transaction: Parameters<typeof getOps>[0]) => {
      const ops = Array.flatten(
        Array.map(Array.ensure(transaction), chunk => getOps(chunk)),
      )
      const ruleParams = Array.findFirst(ops, op => op[0] === 'ruleParams')
      const maybeExpected = Option.flatMap(ruleParams, op =>
        Option.fromNullishOr(
          (op[3] as { expectedUpdatedAtMs?: number }).expectedUpdatedAtMs,
        ),
      )
      sentRuleParams.push(Option.getOrUndefined(Option.map(ruleParams, op => op[3])))
      if (options.isOffline) {
        return { status: 'enqueued', clientId: 'offline' }
      }
      const isCurrent = Option.match(maybeExpected, {
        onNone: () => true,
        onSome: expected => expected === row.updatedAtMs,
      })
      if (options.rule === 'NotOwner' || !isCurrent) {
        throw permissionDenied()
      }
      const update = Array.findFirst(ops, op => op[0] === 'update')
      await sleep(options.commitDelayMs())
      Option.map(update, op => {
        row = { ...row, ...(op[3] as Partial<InstantIssueRecord>) }
      })
      return { status: 'synced', clientId: 'server' }
    },
  }
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions
    database: database as unknown as InstantToolsDatabase,
    reads,
    sentRuleParams,
    stored: () => decodeIssueRecord(row),
    storedRecord: () => row,
    /** Another writer overwrites the row, as a transaction that passed beside ours. */
    overwrite: (change: (issue: Issue) => Issue) => {
      const next = change(decodeIssueRecord(row))
      row = {
        ...row,
        payloadJson: makeInstantIssueRecord(next).payloadJson,
        updatedAtMs: next.updatedAtMs,
      }
    },
    afterNextRead: (hook: () => void) => {
      afterNextRead.push(hook)
    },
  }
}

const entryNamed = (id: string) =>
  IssueWorkLogEntry.make({
    agentId: Option.some(`claude-code/${id}`),
    commitSha: Option.none(),
    durationSeconds: Option.none(),
    id,
    occurredAtMs: 6_000,
    state: Option.some('progress'),
    summary: `${id} logged this.`,
  })

const appending = (entry: IssueWorkLogEntry) => ({
  apply: (current: Issue) =>
    Issue.make({
      ...current,
      workLog: Array.some(current.workLog, logged => logged.id === entry.id)
        ? current.workLog
        : [...current.workLog, entry],
    }),
  hasLanded: (stored: Issue) =>
    Array.some(stored.workLog, logged => logged.id === entry.id),
})

const loggedIds = (issue: Issue): ReadonlyArray<string> =>
  Array.map(issue.workLog, entry => entry.id)

describe('two writers on one Issue', () => {
  it.live(
    'a writer whose read went stale is refused and writes again over the first, so both entries are stored',
    () =>
      Effect.gen(function* () {
        const server = makeServer()
        const tracker = makeIssueTracker(
          makeInstantEntityStore(server.database),
          quick,
        )
        server.afterNextRead(() => {
          server.overwrite(current =>
            Issue.make({
              ...current,
              updatedAtMs: 5_500,
              workLog: [...current.workLog, entryNamed('first-writer')],
            }),
          )
        })

        yield* tracker.update('005', appending(entryNamed('second-writer')))

        expect(loggedIds(server.stored())).toEqual([
          'first-writer',
          'second-writer',
        ])
      }),
  )

  it.live(
    'a writer whose entry another transaction overwrote finds it missing after the settle and writes it again',
    () =>
      Effect.gen(function* () {
        const server = makeServer()
        const tracker = makeIssueTracker(
          makeInstantEntityStore(server.database),
          { retryMs: 1, settleMs: 120 },
        )
        const before = server.stored()
        const write = tracker.update('005', appending(entryNamed('overwritten')))
        const overlapping = Effect.promise(async () => {
          while (!Array.some(server.stored().workLog, entry => entry.id === 'overwritten')) {
            await sleep(1)
          }
          await sleep(15)
          server.overwrite(() =>
            Issue.make({
              ...before,
              updatedAtMs: server.storedRecord().updatedAtMs + 1,
              workLog: [...before.workLog, entryNamed('overlapping')],
            }),
          )
        })

        yield* Effect.all([write, overlapping], { concurrency: 2 })

        expect(loggedIds(server.stored())).toEqual([
          'overlapping',
          'overwritten',
        ])
      }),
  )

  it.live('12 writers appending at once all land', () =>
    Effect.gen(function* () {
      const server = makeServer({
        ...ownerServer,
        commitDelayMs: () => Math.floor(Math.random() * 5),
      })
      const tracker = makeIssueTracker(makeInstantEntityStore(server.database), {
        retryMs: 20,
        settleMs: 30,
      })
      const writers = Array.makeBy(12, index => `writer-${index + 1}`)

      yield* Effect.all(
        Array.map(writers, writer =>
          tracker.update('005', appending(entryNamed(writer))),
        ),
        { concurrency: 'unbounded' },
      )

      expect([...loggedIds(server.stored())].sort()).toEqual(
        [...writers].sort(),
      )
    }),
    30_000,
  )
})

describe('what a write sends', () => {
  it.live('names the updatedAtMs it read, so a stale read is refused', () =>
    Effect.gen(function* () {
      const server = makeServer()
      const tracker = makeIssueTracker(
        makeInstantEntityStore(server.database),
        quick,
      )

      yield* tracker.update('005', appending(entryNamed('one')))

      expect(server.sentRuleParams).toEqual([{ expectedUpdatedAtMs: 5_000 }])
    }),
  )

  it.live(
    'moves updatedAtMs past the stored value even when this clock runs behind it',
    () =>
      Effect.gen(function* () {
        const server = makeServer()
        server.overwrite(current =>
          Issue.make({ ...current, updatedAtMs: 4_000_000_000_000 }),
        )
        const tracker = makeIssueTracker(
          makeInstantEntityStore(server.database),
          quick,
        )

        yield* tracker.update('005', appending(entryNamed('one')))
        const first = server.storedRecord().updatedAtMs
        yield* tracker.update('005', appending(entryNamed('two')))
        const second = server.storedRecord().updatedAtMs

        expect([first, second]).toEqual([4_000_000_000_001, 4_000_000_000_002])
        expect(server.stored().updatedAtMs).toBe(second)
      }),
  )

  it.live(
    'reads the Issue from the server before writing, never from a page copy of the same query',
    () =>
      Effect.gen(function* () {
        const server = makeServer()
        const store = makeInstantEntityStore(server.database)

        yield* store.fetchIssueRecordsById('005')
        yield* store.fetchIssueRecordsById('005')

        const [first, second] = Array.map(server.reads, read => read.options)
        expect(first).toMatchObject({ ruleParams: {} })
        expect(second).toMatchObject({ ruleParams: {} })
        expect(first).not.toEqual(second)
      }),
  )
})

describe('a write that is refused', () => {
  it.live(
    'fails at once, naming the Issue, when Instant refuses a writer whose read was current',
    () =>
      Effect.gen(function* () {
        const server = makeServer({ ...ownerServer, rule: 'NotOwner' })
        const tracker = makeIssueTracker(
          makeInstantEntityStore(server.database),
          quick,
        )

        const error = yield* Effect.flip(
          tracker.update('005', appending(entryNamed('one'))),
        )

        expect(describeIssueTrackerError(error)).toMatch(
          /^Update: Issue 005: Instant refused the write although the Issue had not changed since it was read/,
        )
        expect(server.sentRuleParams).toHaveLength(1)
      }),
  )

  it.live(
    'fails after its attempts, naming the Issue and both stamps, when every read goes stale before its write',
    () =>
      Effect.gen(function* () {
        const server = makeServer()
        const tracker = makeIssueTracker(
          makeInstantEntityStore(server.database),
          quick,
        )
        const keepMoving = (): void => {
          server.afterNextRead(() => {
            server.overwrite(current =>
              Issue.make({ ...current, updatedAtMs: current.updatedAtMs + 10 }),
            )
            keepMoving()
          })
        }
        keepMoving()

        const error = yield* Effect.flip(
          tracker.update('005', appending(entryNamed('one'))),
        )

        expect(describeIssueTrackerError(error)).toMatch(
          /^Update: Issue 005 changed under every one of 12 writes; the last was based on updatedAtMs \d+ while Instant held \d+\. Nothing was written\.$/,
        )
        expect(loggedIds(server.stored())).toEqual([])
      }),
  )

  it.live(
    'is not reported as landed when Instant only queued it offline, and names the Issue',
    () =>
      Effect.gen(function* () {
        const server = makeServer({ ...ownerServer, isOffline: true })
        const tracker = makeIssueTracker(
          makeInstantEntityStore(server.database),
          quick,
        )

        const error = yield* Effect.flip(
          tracker.update('005', appending(entryNamed('one'))),
        )

        expect(describeIssueTrackerError(error)).toMatch(
          /^Update: Issue 005: offline, so the write was only queued/,
        )
        expect(server.sentRuleParams).toHaveLength(1)
      }),
  )
})
