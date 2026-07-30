import { Array, Effect, Option, Ref, Stream } from 'effect'
import { expect, expectTypeOf } from 'vitest'

import { describe, it } from '@effect/vitest'
import {
  InstantCoreDatabase,
  i,
  txInit,
  validateTransactions,
} from '@instantdb/core'

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
import {
  IssueLogReference,
  LogEvent,
  type LoggerService,
} from '../logging/index.js'
import {
  type InstantEntityStoreService,
  type InstantLogIssueLinkRecord,
  InstantToolsEntities,
  InstantToolsSchema,
  decodeIssueRecord,
  makeInstantEntityStore,
  makeInstantIssueRecord,
  makeInstantLogIssueLinkRecords,
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
  area: Option.none(),
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
  claimantId: Option.none(),
  complexity: Option.none(),
  createdAtMs: 1_753_800_000_000,
  details: '',
  id: 'issue-021',
  issueType: Option.none(),
  mentions: [],
  priority: 'P1',
  product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
  projectId: Option.some('transcript-ui'),
  reportedDate: Option.none(),
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
  viewerURL: Option.none(),
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
  const logIssueLinks = yield* Ref.make<
    ReadonlyArray<InstantLogIssueLinkRecord>
  >([])
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
    appendLog: (record, issueLinks) =>
      Effect.all([
        Ref.update(logs, records => [...records, record]),
        Ref.update(logIssueLinks, records => [...records, ...issueLinks]),
      ]).pipe(Effect.asVoid),
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
    observeIssueLogs: issueId =>
      Stream.fromEffect(
        Ref.get(logIssueLinks).pipe(
          Effect.map(records =>
            Array.filter(records, record => record.issueID === issueId),
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
    logIssueLinks,
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
    'reports malformed observed Issue payloads through the typed failure channel',
    () =>
      Effect.gen(function* () {
        const { store } = yield* makeStore
        const malformedRecord = {
          ...makeInstantIssueRecord(issue),
          payloadJson: '{"status":"Future"}',
        }
        const malformedStore: InstantEntityStoreService = {
          ...store,
          observeIssues: Stream.succeed([malformedRecord]),
          observeIssue: () => Stream.succeed(Option.some(malformedRecord)),
        }
        const issueTracker = makeIssueTracker(malformedStore)
        const query = IssueQuery.make({
          limit: 100,
          productId: Option.none(),
          projectId: Option.none(),
          statuses: [],
        })

        const collectionError = yield* Stream.runCollect(
          issueTracker.observe(query),
        ).pipe(Effect.flip)
        const detailError = yield* Stream.runCollect(
          issueTracker.observeIssue(issue.id),
        ).pipe(Effect.flip)

        expect(collectionError).toMatchObject({
          _tag: 'IssueTrackerError',
          operation: 'Observe',
        })
        expect(detailError).toMatchObject({
          _tag: 'IssueTrackerError',
          operation: 'ObserveIssue',
        })
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
      const { logIssueLinks, logs, store } = yield* makeStore
      const logger: LoggerService = makeLogger(store)

      yield* logger.append(event)

      expect(yield* Ref.get(logs)).toHaveLength(1)
      expect(yield* Ref.get(logIssueLinks)).toEqual([
        expect.objectContaining({
          issueID: '023',
          viewerURL: 'https://issues.knophy.com/issues/023',
        }),
      ])
      expect(yield* Stream.runCollect(logger.observeIssue('023'))).toEqual([
        [expect.objectContaining({ issueID: '023', logID: 'log-001' })],
      ])
    }),
  )

  it('encodes deterministic UUID identities for log Issue links', () => {
    const linkedEvent = LogEvent.make({
      ...event,
      issueReferences: [
        IssueLogReference.make({
          issueID: '023',
          viewerURL: 'https://issues.knophy.com/issues/023',
        }),
        IssueLogReference.make({
          issueID: '041',
          viewerURL: 'https://issues.knophy.com/issues/041',
        }),
      ],
    })
    const records = makeInstantLogIssueLinkRecords(linkedEvent)
    const repeatedRecords = makeInstantLogIssueLinkRecords(linkedEvent)
    const recordIDs = Array.map(records, record => record.id)

    expect(recordIDs).toEqual([
      'a7574838-430c-5805-85fe-e41c6120365c',
      'd2db75c9-e061-554c-af6f-b12322b34183',
    ])
    expect(Array.map(repeatedRecords, record => record.id)).toEqual(recordIDs)
    expect(new Set(recordIDs).size).toBe(2)

    const transaction = txInit<typeof InstantToolsSchema>()
    const linkTransactions = Array.map(records, record => {
      const linkEntity = transaction.instantToolsLogIssueLinks[record.id]
      if (linkEntity === undefined) {
        throw new Error('Expected an Instant log Issue link transaction.')
      }
      return linkEntity.update({
        category: record.category,
        contributingPathsJSON: record.contributingPathsJSON,
        issueID: record.issueID,
        level: record.level,
        logID: record.logID,
        logNamespace: record.logNamespace,
        message: record.message,
        name: record.name,
        timestampMs: record.timestampMs,
        viewerURL: record.viewerURL,
      })
    })

    expect(() =>
      validateTransactions(linkTransactions, InstantToolsSchema),
    ).not.toThrow()
  })

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
