import { Array, Effect, Option, Ref, Stream } from 'effect'
import { expect, expectTypeOf } from 'vitest'

import { describe, it } from '@effect/vitest'
import {
  InstantCoreDatabase,
  getOps,
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
  IssueTrackerError,
  type IssueTrackerService,
  IssueWorkLogEntry,
  LibraryProduct,
  ProductCatalogEntry,
  type ProductCatalogService,
  RecordingSegment,
  RepositoryAttachmentSource,
  TriageCandidate,
  type TriageInboxService,
  describeIssueTrackerError,
} from '../issues/index.js'
import {
  IssueLogReference,
  LogEvent,
  type LoggerService,
} from '../logging/index.js'
import {
  InstantEntityStoreError,
  type InstantEntityStoreService,
  type InstantIssueRecord,
  type InstantLogIssueLinkRecord,
  type InstantToolsDatabase,
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

type ProductTransaction = Parameters<typeof getOps>[0]

const makeValidatingProductDatabase = () => {
  const rows = new Map<string, Readonly<Record<string, unknown>>>()
  const database = {
    tx: txInit<typeof InstantToolsSchema>(),
    queryOnce: () =>
      Promise.resolve({ data: { instantToolsProducts: [...rows.values()] } }),
    transact: (transaction: ProductTransaction) => {
      validateTransactions(transaction, InstantToolsSchema)
      for (const [, , entityId, attributes] of getOps(transaction)) {
        const rowId = String(entityId)
        rows.set(rowId, { ...rows.get(rowId), ...attributes, id: rowId })
      }
      return Promise.resolve({ clientId: 'products-test', status: 'synced' })
    },
  }
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions
    database: database as unknown as InstantToolsDatabase,
    rows: () => [...rows.values()],
  }
}

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
    fetchIssues: () => Ref.get(issues),
    fetchProducts: Ref.get(products),
    observeIssues: () => Stream.fromEffect(Ref.get(issues)),
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
    fetchIssueIds: () =>
      Ref.get(issues).pipe(
        Effect.map(records => Array.map(records, record => record.issueID)),
      ),
    fetchIssueRecordsById: issueId =>
      Ref.get(issues).pipe(
        Effect.map(records =>
          Array.filter(records, record => record.issueID === issueId),
        ),
      ),
    createIssue: record =>
      Ref.update(issues, records => [...records, record]).pipe(
        Effect.as(record.id),
      ),
    deleteIssue: entityId =>
      Ref.update(issues, records =>
        Array.filter(records, record => record.id !== entityId),
      ),
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

type NumberedStoreOptions = Readonly<{
  isUniqueIssueIdEnforced: boolean
  isSaveDropped: boolean
  takenWhileCreating: ReadonlyArray<string>
}>

const storedIssueRecord = (
  entityId: string,
  issueId: string,
  title: string,
): InstantIssueRecord => ({
  ...makeInstantIssueRecord(Issue.make({ ...issue, id: issueId, title })),
  id: entityId,
})

const makeNumberedStore = (options: NumberedStoreOptions) =>
  Effect.gen(function* () {
    const { store: baseStore } = yield* makeStore
    const records = yield* Ref.make<ReadonlyArray<InstantIssueRecord>>([
      storedIssueRecord('entity-001', '001', 'First stored Issue'),
      storedIssueRecord('entity-005', '005', 'Fifth stored Issue'),
    ])
    const createdEntityIds = yield* Ref.make<ReadonlyArray<string>>([])
    const pendingTakenIds = yield* Ref.make(options.takenWhileCreating)
    const takeForeignNumber = (issueId: string) =>
      Effect.gen(function* () {
        const pending = yield* Ref.get(pendingTakenIds)
        if (!Array.contains(pending, issueId)) {
          return false
        }
        yield* Ref.set(
          pendingTakenIds,
          Array.filter(pending, id => id !== issueId),
        )
        yield* Ref.update(records, current => [
          ...current,
          storedIssueRecord(
            `foreign-${issueId}`,
            issueId,
            'Filed by another agent',
          ),
        ])
        return true
      })
    const store: InstantEntityStoreService = {
      ...baseStore,
      fetchIssueIds: () =>
        Ref.get(records).pipe(
          Effect.map(current => Array.map(current, record => record.issueID)),
        ),
      fetchIssueRecordsById: issueId =>
        Ref.get(records).pipe(
          Effect.map(current =>
            Array.filter(current, record => record.issueID === issueId),
          ),
        ),
      createIssue: record =>
        Effect.gen(function* () {
          const isTaken = yield* takeForeignNumber(record.issueID)
          if (isTaken && options.isUniqueIssueIdEnforced) {
            return yield* Effect.fail(
              new InstantEntityStoreError({
                cause: new Error('Record not unique: issueID'),
                operation: 'CreateIssue',
              }),
            )
          }
          const entityId = `created-${record.issueID}`
          yield* Ref.update(createdEntityIds, ids => [...ids, entityId])
          yield* Ref.update(records, current => [
            ...current,
            { ...record, id: entityId },
          ])
          return entityId
        }),
      deleteIssue: entityId =>
        Ref.update(records, current =>
          Array.filter(current, record => record.id !== entityId),
        ),
      saveIssue: record =>
        options.isSaveDropped
          ? Effect.void
          : Ref.update(records, current =>
              Array.map(current, stored =>
                stored.issueID === record.issueID
                  ? { ...record, id: stored.id }
                  : stored,
              ),
            ),
    }
    return { createdEntityIds, records, store }
  })

const titledIssue = (issueId: string) =>
  Issue.make({
    ...issue,
    id: issueId,
    title: 'Filed through the one issues command',
    viewerURL: Option.some(`https://issues.knophy.com/issues/${issueId}`),
  })

const payloadOf = (record: InstantIssueRecord): unknown =>
  JSON.parse(record.payloadJson)

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

  it.effect(
    'keeps stored payload keys the Issue schema does not model when it saves',
    () =>
      Effect.gen(function* () {
        const { issues, savedIssues, store } = yield* makeStore
        const storedRecord = makeInstantIssueRecord(issue)
        yield* Ref.set(issues, [
          {
            ...storedRecord,
            payloadJson: JSON.stringify({
              ...JSON.parse(storedRecord.payloadJson),
              derivedMessageEdges: [{ from: 'ClickedRecord', to: 'Started' }],
              files: [{ path: 'issues/files/042.md' }],
            }),
          },
        ])
        const issueTracker = makeIssueTracker(store)

        yield* issueTracker.save(Issue.make({ ...issue, status: 'Blocked' }))

        const savedPayloads = Array.map(yield* Ref.get(savedIssues), record =>
          JSON.parse(record.payloadJson),
        )
        expect(savedPayloads).toHaveLength(1)
        expect(savedPayloads).toMatchObject([
          {
            derivedMessageEdges: [{ from: 'ClickedRecord', to: 'Started' }],
            files: [{ path: 'issues/files/042.md' }],
            status: 'Blocked',
          },
        ])
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
          observeIssues: () => Stream.succeed([malformedRecord]),
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
    'lists the newest Issues first before applying the query limit',
    () =>
      Effect.gen(function* () {
        const { store } = yield* makeStore
        const oldest = Issue.make({ ...issue, createdAtMs: 1_000, id: '001' })
        const newest = Issue.make({ ...issue, createdAtMs: 3_000, id: '584' })
        const middle = Issue.make({ ...issue, createdAtMs: 2_000, id: '300' })
        const catalogOrderStore: InstantEntityStoreService = {
          ...store,
          fetchIssues: () =>
            Effect.succeed(
              Array.map([oldest, newest, middle], makeInstantIssueRecord),
            ),
          observeIssues: () =>
            Stream.succeed(
              Array.map([oldest, newest, middle], makeInstantIssueRecord),
            ),
        }
        const issueTracker = makeIssueTracker(catalogOrderStore)
        const query = IssueQuery.make({
          limit: 2,
          productId: Option.none(),
          projectId: Option.none(),
          statuses: [],
        })

        const fetched = yield* issueTracker.fetch(query)
        const observed = yield* Stream.runCollect(issueTracker.observe(query))

        expect(Array.map(fetched, fetchedIssue => fetchedIssue.id)).toEqual([
          '584',
          '300',
        ])
        expect(
          Array.map(observed, snapshot =>
            Array.map(snapshot, observedIssue => observedIssue.id),
          ),
        ).toEqual([['584', '300']])
      }),
  )

  it.effect(
    'keeps readable Issues when one catalog payload cannot decode',
    () =>
      Effect.gen(function* () {
        const { store } = yield* makeStore
        const malformedRecord = {
          ...makeInstantIssueRecord(issue),
          id: 'malformed',
          issueID: 'malformed',
          payloadJson: '{"status":"Future"}',
        }
        const mixedStore: InstantEntityStoreService = {
          ...store,
          observeIssues: () =>
            Stream.succeed([makeInstantIssueRecord(issue), malformedRecord]),
        }
        const issueTracker = makeIssueTracker(mixedStore)
        const query = IssueQuery.make({
          limit: 100,
          productId: Option.none(),
          projectId: Option.none(),
          statuses: [],
        })

        expect(yield* Stream.runCollect(issueTracker.observe(query))).toEqual([
          [issue],
        ])
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

  it.effect(
    'saves a product through Instant under one UUID row and reads it back by its product id',
    () =>
      Effect.gen(function* () {
        const { database, rows } = makeValidatingProductDatabase()
        const productCatalog = makeProductCatalog(
          makeInstantEntityStore(database),
        )
        const acaga = ApplicationProduct.make({ id: 'acaga', name: 'ACAGA' })

        yield* productCatalog.save(
          ProductCatalogEntry.make({
            product: acaga,
            updatedAtMs: 1_792_000_000_000,
          }),
        )
        yield* productCatalog.save(
          ProductCatalogEntry.make({
            product: acaga,
            updatedAtMs: 1_792_000_000_500,
          }),
        )

        expect(rows()).toEqual([
          {
            id: 'a07f9008-c1d6-5f59-a814-5d0d9ccfde0e',
            kind: 'Application',
            name: 'ACAGA',
            productId: 'acaga',
            updatedAtMs: 1_792_000_000_500,
          },
        ])
        expect(yield* productCatalog.fetch).toEqual([
          ProductCatalogEntry.make({
            product: acaga,
            updatedAtMs: 1_792_000_000_500,
          }),
        ])
      }),
  )

  it.effect(
    'asks Instant only for the Issues in the asked statuses, and for every Issue when none is asked',
    () =>
      Effect.gen(function* () {
        const queries: Array<unknown> = []
        const answer = { data: { instantToolsIssues: [] } }
        const database = {
          queryOnce: (query: unknown) => {
            queries.push(query)
            return Promise.resolve(answer)
          },
          subscribeQuery: (
            query: unknown,
            onResponse: (response: typeof answer) => void,
          ) => {
            queries.push(query)
            onResponse(answer)
            return () => undefined
          },
        }
        const store = makeInstantEntityStore(
          // oxlint-disable-next-line typescript/consistent-type-assertions
          database as unknown as InstantToolsDatabase,
        )
        const tracker = makeIssueTracker(store)
        const query = (statuses: IssueQuery['statuses']) =>
          IssueQuery.make({
            limit: 10,
            productId: Option.none(),
            projectId: Option.none(),
            statuses,
          })

        yield* Stream.runHead(tracker.observe(query(['Open', 'InProgress'])))
        yield* tracker.fetch(query(['Open']))
        yield* store.fetchIssueIds(['Open', 'InProgress'])
        yield* Stream.runHead(tracker.observe(query([])))
        yield* store.fetchIssueIds([])

        const inOpenOrInProgress = {
          status: { $in: ['Open', 'InProgress'] },
        }
        expect(queries).toEqual([
          { instantToolsIssues: { $: { where: inOpenOrInProgress } } },
          {
            instantToolsIssues: { $: { where: { status: { $in: ['Open'] } } } },
          },
          {
            instantToolsIssues: {
              $: { fields: ['issueID'], where: inOpenOrInProgress },
            },
          },
          { instantToolsIssues: {} },
          { instantToolsIssues: { $: { fields: ['issueID'] } } },
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
          viewerURL: 'https://issues.pisspoursoftware.xyz/issues/023',
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

  it.effect(
    'files a new Issue under the number after the highest in use and leaves every stored Issue as it was',
    () =>
      Effect.gen(function* () {
        const { records, store } = yield* makeNumberedStore({
          isSaveDropped: false,
          isUniqueIssueIdEnforced: true,
          takenWhileCreating: [],
        })
        const before = yield* Ref.get(records)

        const filed = yield* makeIssueTracker(store).file(titledIssue)

        expect(filed.id).toBe('006')
        const after = yield* Ref.get(records)
        expect(after).toHaveLength(3)
        expect(Array.take(after, 2)).toEqual(before)
        expect(
          Array.map(
            Array.filter(after, record => record.issueID === '006'),
            payloadOf,
          ),
        ).toMatchObject([{ id: '006', title: filed.title }])
      }),
  )

  it.effect(
    'takes the next number when the store refuses one another agent took first',
    () =>
      Effect.gen(function* () {
        const { records, store } = yield* makeNumberedStore({
          isSaveDropped: false,
          isUniqueIssueIdEnforced: true,
          takenWhileCreating: ['006'],
        })

        const filed = yield* makeIssueTracker(store).file(titledIssue)

        expect(filed.id).toBe('007')
        const sixes = Array.filter(
          yield* Ref.get(records),
          record => record.issueID === '006',
        )
        expect(Array.map(sixes, payloadOf)).toMatchObject([
          { title: 'Filed by another agent' },
        ])
      }),
  )

  it.effect(
    'takes its own record back when a store without the unique rule ends up holding the number twice',
    () =>
      Effect.gen(function* () {
        const { records, store } = yield* makeNumberedStore({
          isSaveDropped: false,
          isUniqueIssueIdEnforced: false,
          takenWhileCreating: ['006'],
        })

        const filed = yield* makeIssueTracker(store).file(titledIssue)

        expect(filed.id).toBe('007')
        const stored = yield* Ref.get(records)
        expect(
          Array.map(
            Array.filter(stored, record => record.issueID === '006'),
            record => record.id,
          ),
        ).toEqual(['foreign-006'])
        expect(
          Array.filter(stored, record => record.issueID === '007'),
        ).toHaveLength(1)
      }),
  )

  it.effect(
    'says a filed Issue was created when reading it back fails, so nobody files it twice',
    () =>
      Effect.gen(function* () {
        const { createdEntityIds, records, store } = yield* makeNumberedStore({
          isSaveDropped: false,
          isUniqueIssueIdEnforced: true,
          takenWhileCreating: [],
        })
        const rateLimitedAfterCreating: InstantEntityStoreService = {
          ...store,
          fetchIssueRecordsById: issueId =>
            Effect.flatMap(Ref.get(createdEntityIds), created =>
              Array.isReadonlyArrayEmpty(created)
                ? store.fetchIssueRecordsById(issueId)
                : Effect.fail(
                    new InstantEntityStoreError({
                      cause: new Error('Your request exceeded the rate limit.'),
                      operation: 'FetchIssueRecords',
                    }),
                  ),
            ),
        }

        const error = yield* Effect.flip(
          makeIssueTracker(rateLimitedAfterCreating).file(titledIssue),
        )

        expect(describeIssueTrackerError(error)).toBe(
          'File: Issue 006 was created as entity created-006, but reading it back failed, so check Issue 006 before filing it again: FetchIssueRecords: Your request exceeded the rate limit.',
        )
        expect(
          Array.map(yield* Ref.get(records), record => record.issueID),
        ).toEqual(['001', '005', '006'])
      }),
  )

  it.effect(
    'reads one Issue by its number in any spelling without reading the catalog',
    () =>
      Effect.gen(function* () {
        const { store } = yield* makeNumberedStore({
          isSaveDropped: false,
          isUniqueIssueIdEnforced: true,
          takenWhileCreating: [],
        })
        const tracker = makeIssueTracker(store)

        expect(
          Option.map(yield* tracker.fetchIssue('#5'), found => found.title),
        ).toEqual(Option.some('Fifth stored Issue'))
        expect(yield* tracker.fetchIssue('404')).toEqual(Option.none())
      }),
  )

  it.effect(
    'appends a work-log entry, keeps unmodeled payload keys, and reads it back',
    () =>
      Effect.gen(function* () {
        const { records, store } = yield* makeNumberedStore({
          isSaveDropped: false,
          isUniqueIssueIdEnforced: true,
          takenWhileCreating: [],
        })
        yield* Ref.update(records, current =>
          Array.map(current, record =>
            record.issueID === '005'
              ? {
                  ...record,
                  payloadJson: JSON.stringify({
                    ...JSON.parse(record.payloadJson),
                    files: [{ path: 'issues/005/notes.md' }],
                  }),
                }
              : record,
          ),
        )
        const entry = IssueWorkLogEntry.make({
          agentId: Option.some('claude-code/issues-one-way'),
          commitSha: Option.some('a1b2c3d'),
          durationSeconds: Option.none(),
          id: 'work-005-claimed-1',
          occurredAtMs: 1_800_000_000_000,
          state: Option.some('claimed'),
          summary: 'Claimed: red tests next.',
        })

        const updated = yield* makeIssueTracker(store).update('005', {
          apply: current =>
            Issue.make({
              ...current,
              claimantId: Option.some('claude-code/issues-one-way'),
              status: 'InProgress',
              workLog: [...current.workLog, entry],
            }),
          hasLanded: stored =>
            Array.some(stored.workLog, logged => logged.id === entry.id),
        })

        expect(updated.status).toBe('InProgress')
        const fives = Array.filter(
          yield* Ref.get(records),
          record => record.issueID === '005',
        )
        expect(Array.map(fives, payloadOf)).toMatchObject([
          {
            claimantId: 'claude-code/issues-one-way',
            files: [{ path: 'issues/005/notes.md' }],
            status: 'InProgress',
            workLog: [{ id: 'work-005-claimed-1', state: 'claimed' }],
          },
        ])
      }),
  )

  it.effect(
    'fails, naming the operation and the cause, when a change does not land',
    () =>
      Effect.gen(function* () {
        const { store } = yield* makeNumberedStore({
          isSaveDropped: true,
          isUniqueIssueIdEnforced: true,
          takenWhileCreating: [],
        })

        const error = yield* Effect.flip(
          makeIssueTracker(store).update('005', {
            apply: current => Issue.make({ ...current, status: 'Blocked' }),
            hasLanded: stored => stored.status === 'Blocked',
          }),
        )

        expect(error.operation).toBe('Update')
        expect(describeIssueTrackerError(error)).toMatch(
          /^Update: Issue 005: the change did not land/,
        )
      }),
  )

  it.effect(
    'deletes one Issue by number and refuses a number two records hold',
    () =>
      Effect.gen(function* () {
        const { records, store } = yield* makeNumberedStore({
          isSaveDropped: false,
          isUniqueIssueIdEnforced: false,
          takenWhileCreating: [],
        })
        const tracker = makeIssueTracker(store)

        const deleted = yield* tracker.delete('5')

        expect(deleted.title).toBe('Fifth stored Issue')
        expect(
          Array.map(yield* Ref.get(records), record => record.issueID),
        ).toEqual(['001'])

        yield* Ref.update(records, current => [
          ...current,
          storedIssueRecord('entity-001-copy', '001', 'A second 001'),
        ])
        const refused = yield* Effect.flip(tracker.delete('001'))
        expect(describeIssueTrackerError(refused)).toBe(
          'Delete: Issue 001 is held by 2 records (entity-001, entity-001-copy); delete one by hand after reading both.',
        )
        expect(yield* Ref.get(records)).toHaveLength(2)
      }),
  )

  it('names the operation and the real cause of a failure, never the bare tag', () => {
    const error = new IssueTrackerError({
      cause: new InstantEntityStoreError({
        cause: new Error('Permission denied: instantToolsIssues'),
        operation: 'CreateIssue',
      }),
      operation: 'File',
    })

    expect(describeIssueTrackerError(error)).toBe(
      'File: CreateIssue: Permission denied: instantToolsIssues',
    )
  })

  it('never names a credential that Instant echoes back in its hint', () => {
    const refusal = Object.assign(
      new Error('Record not found: app-admin-token'),
      {
        body: {
          hint: {
            args: [
              {
                'app-id': 'app-692',
                token: 'secret-admin-token-692',
              },
            ],
            message: 'This admin token may be expired or invalid.',
          },
          message: 'Record not found: app-admin-token',
        },
      },
    )
    const error = new IssueTrackerError({
      cause: new InstantEntityStoreError({
        cause: refusal,
        operation: 'FetchIssueIds',
      }),
      operation: 'File',
    })

    const described = describeIssueTrackerError(error)

    expect(described).not.toContain('secret-admin-token-692')
    expect(described).toBe(
      'File: FetchIssueIds: Record not found: app-admin-token: Record not found: app-admin-token ({"args":[{"app-id":"app-692","token":"[redacted]"}],"message":"This admin token may be expired or invalid."})',
    )
  })
})
