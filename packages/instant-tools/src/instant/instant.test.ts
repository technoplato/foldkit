import { Effect, Option, Ref } from 'effect'
import { expect, expectTypeOf } from 'vitest'

import { describe, it } from '@effect/vitest'
import { InstantCoreDatabase, i } from '@instantdb/core'

import {
  ApplicationProduct,
  Issue,
  IssueAttachment,
  IssueQuery,
  type IssueTrackerService,
  RepositoryAttachmentSource,
} from '../issues/index.js'
import { LogEvent, type LoggerService } from '../logging/index.js'
import {
  type InstantEntityStoreService,
  InstantToolsEntities,
  decodeIssueRecord,
  makeInstantEntityStore,
  makeInstantIssueRecord,
  makeIssueTracker,
  makeLogger,
} from './instant.js'

const ApplicationSchema = i.schema({
  entities: {
    ...InstantToolsEntities,
    notes: i.entity({
      body: i.string(),
    }),
  },
})

const adaptApplicationDatabase = (
  database: InstantCoreDatabase<typeof ApplicationSchema>,
) => makeInstantEntityStore(database)

const issue = Issue.make({
  attachments: [
    IssueAttachment.make({
      byteCount: Option.some(334_048),
      capturedAtMs: Option.some(1_753_842_697_000),
      contentType: 'image/png',
      fileName: 'offset.png',
      id: 'attachment-042-1',
      issueId: 'issue-021',
      kind: 'Screenshot',
      sha256: Option.some(
        '28da2c5f4e14e976f3c04f56684ecf2778e88c488d0b9090117814e4a7ee9b83',
      ),
      source: RepositoryAttachmentSource.make({
        path: 'issues/attachments/042/offset.png',
      }),
    }),
  ],
  createdAtMs: 1_753_800_000_000,
  details: '',
  id: 'issue-021',
  mentions: [],
  priority: 'P1',
  product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
  projectId: Option.some('transcript-ui'),
  sourceDocument: Option.none(),
  status: 'InProgress',
  title: 'Put the full recording timestamp in the gutter',
  updatedAtMs: 1_753_825_157_000,
  workLog: [],
})

const event = LogEvent.make({
  category: 'transcript',
  directQuote: Option.none(),
  id: 'log-001',
  level: 'Warning',
  message: 'Transcript content exceeded its available width.',
  metadata: { issueId: 'issue-023' },
  name: 'transcript.wrapping.failed',
  source: Option.none(),
  timestampMs: 1_753_825_167_000,
})

const makeStore = Effect.gen(function* () {
  const issues = yield* Ref.make([makeInstantIssueRecord(issue)])
  const savedIssues = yield* Ref.make<
    ReadonlyArray<ReturnType<typeof makeInstantIssueRecord>>
  >([])
  const logs = yield* Ref.make<ReadonlyArray<unknown>>([])
  const store: InstantEntityStoreService = {
    appendLog: record => Ref.update(logs, records => [...records, record]),
    fetchIssues: Ref.get(issues),
    saveIssue: record =>
      Ref.update(savedIssues, records => [...records, record]),
  }
  return { issues, logs, savedIssues, store }
})

describe('Instant adapter', () => {
  it('accepts an application database that composes the Instant Tools entities', () => {
    expectTypeOf(adaptApplicationDatabase).toBeFunction()
  })

  it.effect(
    'persists one portable Issue payload and decodes it losslessly',
    () =>
      Effect.gen(function* () {
        const { savedIssues, store } = yield* makeStore
        const issueTracker: IssueTrackerService = makeIssueTracker(store)

        yield* issueTracker.save(issue)

        const records = yield* Ref.get(savedIssues)
        expect(records).toHaveLength(1)
        const maybeRecord = Option.fromIterable(records)
        expect(
          Option.map(maybeRecord, record => ({
            attachmentCount: record.attachmentCount,
            attachmentIdsJson: record.attachmentIdsJson,
          })),
        ).toEqual(
          Option.some({
            attachmentCount: 1,
            attachmentIdsJson: '["attachment-042-1"]',
          }),
        )
        expect(Option.map(maybeRecord, decodeIssueRecord)).toEqual(
          Option.some(issue),
        )
      }),
  )

  it.effect('filters queried Issues through the portable query domain', () =>
    Effect.gen(function* () {
      const { store } = yield* makeStore
      const issueTracker: IssueTrackerService = makeIssueTracker(store)

      const issues = yield* issueTracker.fetch(
        IssueQuery.make({
          limit: 100,
          productId: Option.some('scribe'),
          projectId: Option.some('transcript-ui'),
          statuses: ['InProgress'],
        }),
      )

      expect(issues).toEqual([issue])
    }),
  )

  it.effect('persists structured Log Events through the separate Logger', () =>
    Effect.gen(function* () {
      const { logs, store } = yield* makeStore
      const logger: LoggerService = makeLogger(store)

      yield* logger.append(event)

      expect(yield* Ref.get(logs)).toHaveLength(1)
    }),
  )
})
