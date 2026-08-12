import {
  Array,
  Cause,
  Data,
  Effect,
  Function,
  Option,
  Predicate,
  Queue,
  Record as Record_,
  Schema as S,
  SchemaAST,
  Scope,
  Stream,
} from 'effect'

import {
  InstantV3OriginEnrollmentClaimRecord,
  type InstantV3OriginEnrollmentClaimRecord as InstantV3OriginEnrollmentClaimRecordType,
  InstantV3ProgramSessionRecord,
  type InstantV3ProgramSessionRecord as InstantV3ProgramSessionRecordType,
  type V3InstantProgramAuthorityDatabase,
  V3InstantProgramAuthorityDatabaseCapability,
  type V3InstantProgramAuthoritySnapshotQuery,
  type V3InstantProgramQuery,
  V3ProgramStoreError,
} from '@foldkit/instant'
import type { InstantAdminDatabase } from '@instantdb/admin'

import type { schema } from '../../../instant.schema.js'
import {
  MultipleCountersV3PolicyRequestRecord,
  type MultipleCountersV3PolicyRequestRecord as MultipleCountersV3PolicyRequestRecordType,
  MultipleCountersV3PolicyResolutionRecord,
  type MultipleCountersV3PolicyResolutionRecord as MultipleCountersV3PolicyResolutionRecordType,
} from '../shared/policyRequest.js'

const MultipleCountersV3AuthorityWriterDeclarationSchema = S.Struct({
  processId: S.String.check(S.isMinLength(1)),
  writeIsolation: S.Literal('ExclusiveSerializedWriter'),
})

/** The exact trusted admin methods consumed by the protocol-v3 headless lane. */
export type MultipleCountersV3AdminDatabase = Pick<
  InstantAdminDatabase<typeof schema>,
  'query' | 'subscribeQuery' | 'transact' | 'tx'
>

/** Host evidence that this is the sole authority writer deployment. */
export type MultipleCountersV3AuthorityWriterDeclaration = Readonly<{
  processId: string
  writeIsolation: 'ExclusiveSerializedWriter'
}>

/** A second authority writer attempted to enter this JavaScript process. */
export class MultipleCountersV3AuthorityWriterError extends Data.TaggedError(
  'MultipleCountersV3AuthorityWriterError',
)<{
  readonly activeProcessId: string
  readonly reason: 'AlreadyRunning' | 'InvalidDeclaration'
  readonly requestedProcessId: string
}> {}

/** A demo policy request subscription failed outside the reusable v3 store. */
export class MultipleCountersV3PolicyDatabaseError extends Data.TaggedError(
  'MultipleCountersV3PolicyDatabaseError',
)<Readonly<{ cause: unknown; operation: 'ObservePolicyRequests' }>> {}

/** An authority database plus server-wide discovery Streams owned by one lease. */
export type MultipleCountersV3HeadlessDatabase = Readonly<{
  appendPolicyTransition: (
    session: InstantV3ProgramSessionRecordType | null,
    resolution: MultipleCountersV3PolicyResolutionRecordType,
  ) => Promise<void>
  authority: V3InstantProgramAuthorityDatabase
  enrollmentClaims: Stream.Stream<
    ReadonlyArray<InstantV3OriginEnrollmentClaimRecordType>,
    V3ProgramStoreError
  >
  programSessions: Stream.Stream<
    ReadonlyArray<InstantV3ProgramSessionRecordType>,
    V3ProgramStoreError
  >
  policyRequests: Stream.Stream<
    ReadonlyArray<MultipleCountersV3PolicyRequestRecordType>,
    MultipleCountersV3PolicyDatabaseError
  >
  queryPolicyResolution: (
    policyResolutionPositionKey: string,
  ) => Promise<Option.Option<MultipleCountersV3PolicyResolutionRecordType>>
}>

type ClosableSubscription = Readonly<{ close: () => void }>

const strictDecodeOptions: SchemaAST.ParseOptions = {
  errors: 'all',
  onExcessProperty: 'error',
}

const activeWriterProcessIds = new Set<string>()

const subscriptionCloser =
  (subscription: ClosableSubscription): (() => void) =>
  () =>
    subscription.close()

const subscribeAuthorityQuery = (
  database: MultipleCountersV3AdminDatabase,
  query: V3InstantProgramQuery,
  listener: (response: unknown) => void,
): (() => void) => {
  if (
    'foldkitV3AcceptedMessageOccurrences' in query &&
    'foldkitV3MessageProposalResolutions' in query
  ) {
    return subscriptionCloser(database.subscribeQuery(query, listener))
  } else if ('foldkitV3AcceptedMessageOccurrences' in query) {
    return subscriptionCloser(database.subscribeQuery(query, listener))
  } else if ('foldkitV3EffectPlacements' in query) {
    return subscriptionCloser(database.subscribeQuery(query, listener))
  } else if ('foldkitV3EffectRequests' in query) {
    return subscriptionCloser(database.subscribeQuery(query, listener))
  } else if ('foldkitV3MessageProposals' in query) {
    return subscriptionCloser(database.subscribeQuery(query, listener))
  } else if ('foldkitV3MessageProposalResolutions' in query) {
    return subscriptionCloser(database.subscribeQuery(query, listener))
  } else if ('foldkitV3OriginEnrollmentClaims' in query) {
    return subscriptionCloser(database.subscribeQuery(query, listener))
  } else if ('foldkitV3OriginPolicyDecisions' in query) {
    return subscriptionCloser(database.subscribeQuery(query, listener))
  } else if ('foldkitV3ProgramSessions' in query) {
    return subscriptionCloser(database.subscribeQuery(query, listener))
  } else {
    return subscriptionCloser(database.subscribeQuery(query, listener))
  }
}

const queryAuthority = (
  database: MultipleCountersV3AdminDatabase,
  query: V3InstantProgramQuery | V3InstantProgramAuthoritySnapshotQuery,
): Promise<unknown> => {
  if (
    'foldkitV3OriginPolicyDecisions' in query &&
    'foldkitV3EffectRequests' in query
  ) {
    return database.query(query)
  } else if (
    'foldkitV3AcceptedMessageOccurrences' in query &&
    'foldkitV3MessageProposalResolutions' in query
  ) {
    return database.query(query)
  } else if ('foldkitV3AcceptedMessageOccurrences' in query) {
    return database.query(query)
  } else if ('foldkitV3EffectPlacements' in query) {
    return database.query(query)
  } else if ('foldkitV3EffectRequests' in query) {
    return database.query(query)
  } else if ('foldkitV3MessageProposals' in query) {
    return database.query(query)
  } else if ('foldkitV3MessageProposalResolutions' in query) {
    return database.query(query)
  } else if ('foldkitV3OriginEnrollmentClaims' in query) {
    return database.query(query)
  } else if ('foldkitV3OriginPolicyDecisions' in query) {
    return database.query(query)
  } else if ('foldkitV3ProgramSessions' in query) {
    return database.query(query)
  } else {
    return database.query(query)
  }
}

const queryData = (payload: unknown): unknown => {
  if (!Predicate.isObject(payload)) {
    throw new Error('Expected an Instant admin subscription payload.')
  }
  const maybeError = Record_.get(payload, 'error')
  if (Option.isSome(maybeError) && maybeError.value !== undefined) {
    throw maybeError.value
  }
  const maybeType = Record_.get(payload, 'type')
  if (Option.isSome(maybeType) && maybeType.value === 'error') {
    throw new Error('Instant admin subscription failed.')
  }
  return Option.getOrElse(Record_.get(payload, 'data'), () => payload)
}

const queryRows = (
  payload: unknown,
  namespace: string,
): ReadonlyArray<unknown> => {
  const data = queryData(payload)
  if (!Predicate.isObject(data)) {
    throw new Error('Expected Instant admin query data.')
  }
  const maybeRows = Record_.get(data, namespace)
  if (Option.isNone(maybeRows)) {
    throw new Error(`Instant admin query omitted ${namespace}.`)
  }
  return S.decodeUnknownSync(
    S.Array(S.Unknown),
    strictDecodeOptions,
  )(maybeRows.value)
}

const normalizeProgramSession = (input: unknown): unknown => {
  if (!Predicate.isObject(input)) {
    return input
  }
  return {
    ...input,
    previousLifecyclePositionKey: Option.getOrNull(
      Record_.get(input, 'previousLifecyclePositionKey'),
    ),
  }
}

const observeAdminQuery = <Record>(
  operation: V3ProgramStoreError['operation'],
  subscribe: (
    publish: (records: ReadonlyArray<Record>) => void,
    fail: (cause: unknown) => void,
  ) => ClosableSubscription,
): Stream.Stream<ReadonlyArray<Record>, V3ProgramStoreError> =>
  Stream.callback(queue =>
    Effect.acquireRelease(
      Effect.sync(() =>
        subscribe(
          records => {
            Queue.offerUnsafe(queue, records)
          },
          cause => {
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(new V3ProgramStoreError({ cause, operation })),
            )
          },
        ),
      ),
      subscription => Effect.sync(() => subscription.close()),
    ),
  )

const observeAllEnrollmentClaims = (
  database: MultipleCountersV3AdminDatabase,
): MultipleCountersV3HeadlessDatabase['enrollmentClaims'] =>
  observeAdminQuery('ObserveOriginEnrollmentClaims', (publish, fail) =>
    database.subscribeQuery(
      {
        foldkitV3OriginEnrollmentClaims: {
          $: { order: { claimedAtMs: 'asc' } },
        },
      },
      payload => {
        try {
          publish(
            S.decodeUnknownSync(
              S.Array(InstantV3OriginEnrollmentClaimRecord),
              strictDecodeOptions,
            )(queryRows(payload, 'foldkitV3OriginEnrollmentClaims')),
          )
        } catch (cause) {
          fail(cause)
        }
      },
    ),
  )

const observeAllProgramSessions = (
  database: MultipleCountersV3AdminDatabase,
): MultipleCountersV3HeadlessDatabase['programSessions'] =>
  observeAdminQuery('ObserveProgramSessions', (publish, fail) =>
    database.subscribeQuery(
      {
        foldkitV3ProgramSessions: {
          $: { order: { lifecycleGeneration: 'asc' } },
        },
      },
      payload => {
        try {
          publish(
            S.decodeUnknownSync(
              S.Array(InstantV3ProgramSessionRecord),
              strictDecodeOptions,
            )(
              Array.map(
                queryRows(payload, 'foldkitV3ProgramSessions'),
                normalizeProgramSession,
              ),
            ),
          )
        } catch (cause) {
          fail(cause)
        }
      },
    ),
  )

const observeAllPolicyRequests = (
  database: MultipleCountersV3AdminDatabase,
): MultipleCountersV3HeadlessDatabase['policyRequests'] =>
  Stream.callback(queue =>
    Effect.acquireRelease(
      Effect.sync(() =>
        database.subscribeQuery(
          {
            multipleCountersV3PolicyRequests: {
              $: { order: { requestedAtMs: 'asc' } },
            },
          },
          payload => {
            try {
              Queue.offerUnsafe(
                queue,
                S.decodeUnknownSync(
                  S.Array(MultipleCountersV3PolicyRequestRecord),
                  strictDecodeOptions,
                )(queryRows(payload, 'multipleCountersV3PolicyRequests')),
              )
            } catch (cause) {
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(
                  new MultipleCountersV3PolicyDatabaseError({
                    cause,
                    operation: 'ObservePolicyRequests',
                  }),
                ),
              )
            }
          },
        ),
      ),
      subscription => Effect.sync(() => subscription.close()),
    ),
  )

const queryPolicyResolution = (
  database: MultipleCountersV3AdminDatabase,
  policyResolutionPositionKey: string,
): Promise<Option.Option<MultipleCountersV3PolicyResolutionRecordType>> =>
  database
    .query({
      multipleCountersV3PolicyRequestResolutions: {
        $: { where: { policyResolutionPositionKey } },
      },
    })
    .then(payload =>
      Array.head(
        S.decodeUnknownSync(
          S.Array(MultipleCountersV3PolicyResolutionRecord),
          strictDecodeOptions,
        )(queryRows(payload, 'multipleCountersV3PolicyRequestResolutions')),
      ),
    )

const programSessionTransaction = (
  database: MultipleCountersV3AdminDatabase,
  session: InstantV3ProgramSessionRecordType,
) => {
  const entity = database.tx.foldkitV3ProgramSessions[session.id]
  if (entity === undefined) {
    throw new Error('Expected the v3 Program session transaction entity.')
  }
  const { id: _id, previousLifecyclePositionKey, ...requiredFields } = session
  return entity.create({
    ...requiredFields,
    ...(previousLifecyclePositionKey === null
      ? {}
      : { previousLifecyclePositionKey }),
  })
}

const policyResolutionTransaction = (
  database: MultipleCountersV3AdminDatabase,
  resolution: MultipleCountersV3PolicyResolutionRecordType,
) => {
  const entity =
    database.tx.multipleCountersV3PolicyRequestResolutions[resolution.id]
  if (entity === undefined) {
    throw new Error('Expected the v3 policy resolution transaction entity.')
  }
  const { id: _id, ...fields } = resolution
  return entity.create(fields)
}

const appendPolicyTransition = (
  database: MultipleCountersV3AdminDatabase,
  session: InstantV3ProgramSessionRecordType | null,
  resolution: MultipleCountersV3PolicyResolutionRecordType,
): Promise<void> => {
  const resolutionTransaction = policyResolutionTransaction(
    database,
    resolution,
  )
  if (session === null) {
    return database.transact(resolutionTransaction).then(Function.constVoid)
  }
  return database
    .transact([
      programSessionTransaction(database, session),
      resolutionTransaction,
    ])
    .then(Function.constVoid)
}

const makeHeadlessDatabase = (
  database: MultipleCountersV3AdminDatabase,
): MultipleCountersV3HeadlessDatabase => ({
  appendPolicyTransition: (session, resolution) =>
    appendPolicyTransition(database, session, resolution),
  authority: {
    authorityCapability: V3InstantProgramAuthorityDatabaseCapability.make({
      protocolVersion: 3,
      writeIsolation: 'ExclusiveSerializedWriter',
    }),
    currentConnectionStatus: () => 'authenticated',
    query: query => queryAuthority(database, query),
    subscribeConnectionStatus: () => Function.constVoid,
    subscribeQuery: (query, listener) =>
      subscribeAuthorityQuery(database, query, listener),
    transact: transactions => database.transact(transactions),
    tx: database.tx,
  },
  enrollmentClaims: observeAllEnrollmentClaims(database),
  policyRequests: observeAllPolicyRequests(database),
  programSessions: observeAllProgramSessions(database),
  queryPolicyResolution: policyResolutionPositionKey =>
    queryPolicyResolution(database, policyResolutionPositionKey),
})

/** Acquires the sole process-local v3 writer and normalizes a real admin DB. */
export const acquireMultipleCountersV3HeadlessDatabase = (
  database: MultipleCountersV3AdminDatabase,
  declaration: MultipleCountersV3AuthorityWriterDeclaration,
): Effect.Effect<
  MultipleCountersV3HeadlessDatabase,
  MultipleCountersV3AuthorityWriterError,
  Scope.Scope
> =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      const maybeDeclaration = S.decodeUnknownOption(
        MultipleCountersV3AuthorityWriterDeclarationSchema,
      )(declaration)
      if (Option.isNone(maybeDeclaration)) {
        return yield* new MultipleCountersV3AuthorityWriterError({
          activeProcessId: '',
          reason: 'InvalidDeclaration',
          requestedProcessId: declaration.processId,
        })
      }
      const maybeActiveProcessId = Array.head(
        Array.fromIterable(activeWriterProcessIds),
      )
      if (Option.isSome(maybeActiveProcessId)) {
        return yield* new MultipleCountersV3AuthorityWriterError({
          activeProcessId: maybeActiveProcessId.value,
          reason: 'AlreadyRunning',
          requestedProcessId: declaration.processId,
        })
      }
      activeWriterProcessIds.add(declaration.processId)
      return declaration.processId
    }),
    processId =>
      Effect.sync(() => {
        activeWriterProcessIds.delete(processId)
      }),
  ).pipe(Effect.map(() => makeHeadlessDatabase(database)))
