import { Array, Effect, Option, Ref, Stream } from 'effect'
import { expect, expectTypeOf } from 'vitest'

import { describe, it } from '@effect/vitest'
import { InstantCoreDatabase, i } from '@instantdb/core'

import {
  ApplicationProduct,
  Issue,
  IssueAttachment,
  IssueQuery,
  IssueSuccessCriterion,
  type IssueTrackerService,
  LibraryProduct,
  ProductCatalogEntry,
  type ProductCatalogService,
  RecordingSegment,
  RepositoryAttachmentSource,
  TriageCandidate,
  type TriageInboxService,
} from '../issues/index.js'
import { LogEvent, type LoggerService } from '../logging/index.js'
import {
  type InstantEntityStoreService,
  InstantToolsEntities,
  decodeIssueRecord,
  makeInstantEntityStore,
  makeInstantIssueRecord,
  makeInstantProductRecord,
  makeInstantRecordingSegmentRecord,
  makeInstantTriageCandidateRecord,
  makeIssueTracker,
  makeLogger,
  makeProductCatalog,
  makeTriageInbox,
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
  successCriteria: [
    IssueSuccessCriterion.make({
      id: 'compact-initial-placement',
      outcome: 'The first transcript row starts at the top reading position.',
      requiredEvidence: ['FocusedTest', 'PhysicalDeviceInteraction'],
    }),
  ],
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

const segment = RecordingSegment.make({
  createdAtMs: 1_753_825_157_000,
  endMilliseconds: 49_000,
  id: 'segment-001',
  publicUrl: Option.some('/segments/segment-001'),
  recordingId: 'recording-001',
  startMilliseconds: 42_000,
  transcript: 'The transcript gutter is hiding the recording time.',
})

const candidate = TriageCandidate.make({
  createdAtMs: 1_753_825_157_000,
  id: 'candidate-001',
  product: issue.product,
  segment,
  status: 'Draft',
  suggestedDetails: segment.transcript,
  suggestedPriority: 'P2',
  suggestedTitle: 'Transcript gutter hides recording time',
  updatedAtMs: 1_753_825_157_000,
})

const makeStore = Effect.gen(function* () {
  const issues = yield* Ref.make([makeInstantIssueRecord(issue)])
  const savedIssues = yield* Ref.make<
    ReadonlyArray<ReturnType<typeof makeInstantIssueRecord>>
  >([])
  const logs = yield* Ref.make<ReadonlyArray<unknown>>([])
  const recordingSegments = yield* Ref.make([
    makeInstantRecordingSegmentRecord(segment),
  ])
  const triageCandidates = yield* Ref.make([
    makeInstantTriageCandidateRecord(candidate),
  ])
  const products = yield* Ref.make([
    makeInstantProductRecord(
      ProductCatalogEntry.make({
        product: issue.product,
        updatedAtMs: issue.updatedAtMs,
      }),
    ),
    makeInstantProductRecord(
      ProductCatalogEntry.make({
        product: LibraryProduct.make({ id: 'foldkit', name: 'Foldkit' }),
        updatedAtMs: issue.updatedAtMs,
      }),
    ),
  ])
  const store: InstantEntityStoreService = {
    appendLog: record => Ref.update(logs, records => [...records, record]),
    fetchIssues: Ref.get(issues),
    fetchProducts: Ref.get(products),
    observeIssues: Stream.fromEffect(Ref.get(issues)),
    observeIssue: issueId =>
      Stream.fromEffect(
        Ref.get(issues).pipe(
          Effect.map(records =>
            Array.findFirst(records, record => record.id === issueId),
          ),
        ),
      ),
    observeProducts: Stream.fromEffect(Ref.get(products)),
    observeRecordingSegment: segmentId =>
      Stream.fromEffect(
        Ref.get(recordingSegments).pipe(
          Effect.map(records =>
            Array.findFirst(records, record => record.id === segmentId),
          ),
        ),
      ),
    observeTriageCandidates: Stream.fromEffect(Ref.get(triageCandidates)),
    saveIssue: record =>
      Ref.update(savedIssues, records => [...records, record]),
    saveProduct: record =>
      Ref.update(products, records => [...records, record]),
    saveRecordingSegment: record =>
      Ref.update(recordingSegments, records => [...records, record]),
    saveTriageCandidate: record =>
      Ref.update(triageCandidates, records => [...records, record]),
  }
  return {
    issues,
    logs,
    products,
    recordingSegments,
    savedIssues,
    store,
    triageCandidates,
  }
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

  it.effect(
    'observes filtered Issue collections and one Issue by identity',
    () =>
      Effect.gen(function* () {
        const { store } = yield* makeStore
        const issueTracker: IssueTrackerService = makeIssueTracker(store)
        const query = IssueQuery.make({
          limit: 100,
          productId: Option.some('scribe'),
          projectId: Option.some('transcript-ui'),
          statuses: ['InProgress'],
        })

        expect(yield* Stream.runCollect(issueTracker.observe(query))).toEqual([
          [issue],
        ])
        expect(
          yield* Stream.runCollect(issueTracker.observeIssue(issue.id)),
        ).toEqual([Option.some(issue)])
        expect(
          yield* Stream.runCollect(issueTracker.observeIssue('missing')),
        ).toEqual([Option.none()])
      }),
  )

  it.effect(
    'persists and observes Applications and Libraries as products',
    () =>
      Effect.gen(function* () {
        const { store } = yield* makeStore
        const productCatalog: ProductCatalogService = makeProductCatalog(store)
        const application = ApplicationProduct.make({
          id: 'issues',
          name: 'Issues',
        })

        yield* productCatalog.save(
          ProductCatalogEntry.make({
            product: application,
            updatedAtMs: issue.updatedAtMs,
          }),
        )

        const products = yield* productCatalog.fetch
        expect(products.map(product => product.product._tag)).toEqual([
          'Application',
          'Library',
          'Application',
        ])
        expect(yield* Stream.runCollect(productCatalog.observe)).toEqual([
          expect.arrayContaining([
            expect.objectContaining({ product: issue.product }),
            expect.objectContaining({
              product: LibraryProduct.make({
                id: 'foldkit',
                name: 'Foldkit',
              }),
            }),
          ]),
        ])
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

  it.effect(
    'persists and observes transcript candidates and shareable segments',
    () =>
      Effect.gen(function* () {
        const { recordingSegments, store, triageCandidates } = yield* makeStore
        const inbox: TriageInboxService = makeTriageInbox(store)

        yield* inbox.saveSegment(segment)
        yield* inbox.saveCandidate(candidate)

        expect(yield* Stream.runCollect(inbox.observeCandidates)).toEqual([
          [candidate, candidate],
        ])
        expect(
          yield* Stream.runCollect(inbox.observeSegment(segment.id)),
        ).toEqual([Option.some(segment)])
        expect(yield* Ref.get(recordingSegments)).toHaveLength(2)
        expect(yield* Ref.get(triageCandidates)).toHaveLength(2)
      }),
  )
})
