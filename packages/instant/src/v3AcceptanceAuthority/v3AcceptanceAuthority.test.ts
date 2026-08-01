import {
  Array,
  Data,
  Deferred,
  Effect,
  Fiber,
  Match as M,
  Option,
  Ref,
  Result,
  Schema as S,
  Semaphore,
} from 'effect'
import { Command, Processor, Program, Synchronization } from 'foldkit'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import {
  OriginEffectResultSigningRecord,
  deriveOriginClientKeyPair,
  deriveOriginDeviceKeyPair,
  deriveOriginProcessorKeyPair,
  digestOriginOrdinaryMessageProposalProof,
  encodeOriginClientCertificateJson,
  encodeOriginProcessorCertificateJson,
  makeOriginClientCertificate,
  makeOriginProcessorCertificate,
  signOriginEffectResultProposal,
} from '../originProof/index.js'
import { makeV3InMemoryProgramStores } from '../v3InMemoryProgramStore/index.js'
import {
  V3ProgramAuthorityCoordinatorCapability,
  V3ProgramAuthorityStoreCapability,
  type V3ProgramAuthorityStoreService,
  V3ProgramStoreScope,
  makeV3ProgramAuthorityCriticalSectionInvocation,
  v3ServerConfirmedTransactionOutcome,
} from '../v3ProgramStore/index.js'
import {
  type InstantV3AcceptedMessageOccurrenceRecord,
  InstantV3AcceptedMessageProposalResolutionRecord,
  InstantV3AcceptedOrdinaryMessageOccurrenceRecord,
  InstantV3ActiveOriginPolicyDecision,
  InstantV3EffectPlacementRecord,
  InstantV3EffectRequestRecord,
  InstantV3EntityId,
  InstantV3MessageProposalRecord,
  InstantV3OrdinaryMessageProposalRecord,
  InstantV3OriginPolicyDecisionRecord,
  InstantV3ProgramSessionIdentity,
  InstantV3ProgramSessionRecord,
  InstantV3RevokedOriginPolicyDecision,
  InstantV3TimestampMs,
  instantV3OriginPolicyProtocolVersion,
  instantV3ProgramProtocolVersion,
  makeInstantV3AcceptedActorSequencePositionKey,
  makeInstantV3AcceptedMessageIdempotencyPositionKey,
  makeInstantV3AcceptedOccurrencePositionKey,
  makeInstantV3AcceptedProposalPositionKey,
  makeInstantV3AcceptedSequencePositionKey,
  makeInstantV3CapabilityIdIndex,
  makeInstantV3EffectPlacementPositionKey,
  makeInstantV3EffectRequestIdempotencyPositionKey,
  makeInstantV3EffectRequestPositionKey,
  makeInstantV3MessageProposalActorSequencePositionKey,
  makeInstantV3MessageProposalEffectIdempotencyPositionKey,
  makeInstantV3MessageProposalEffectRequestResultPositionKey,
  makeInstantV3MessageProposalMessageIdempotencyPositionKey,
  makeInstantV3MessageProposalOccurrencePositionKey,
  makeInstantV3MessageProposalPositionKey,
  makeInstantV3OriginEnrollmentClaimPositionKey,
  makeInstantV3OriginPolicyDecisionPositionKey,
  makeInstantV3ProgramSessionLifecyclePositionKey,
  printInstantV3ProgramSessionId,
} from '../v3Schema/index.js'
import {
  V3SharedProgramInvocationFacts,
  type V3SharedProgramMessageProtocol,
  V3SharedProgramMessageProtocolError,
  type V3SharedProgramOrigin,
  type V3SharedProgramProcessor,
  type V3SharedProgramProposedEffectResultEnvelopeInput,
  V3SharedProgramSynchronizationPreflightError,
  makeV3SharedProgramMessageProtocol,
  makeV3SharedProgramProcessor,
} from '../v3SharedProgramProcessor/index.js'
import {
  type V3AcceptanceAuthorityDefinition,
  V3AcceptanceAuthoritySnapshot,
  evaluateV3AcceptanceAuthorityProposal,
  makeV3AcceptanceAuthority,
  projectV3AcceptanceAuthorityModel,
} from './v3AcceptanceAuthority.js'

const Navigation = S.Literals(['List', 'Detail'])
const DeletePrompt = S.Literals(['Closed', 'Open'])
const Model = S.Struct({
  count: S.Int,
  deletePrompt: DeletePrompt,
  navigation: Navigation,
})
type Model = typeof Model.Type

const Incremented = S.TaggedStruct('Incremented', {})
const OpenedDetail = S.TaggedStruct('OpenedDetail', {})
const OpenedDeletePrompt = S.TaggedStruct('OpenedDeletePrompt', {})
const ConfirmedDelete = S.TaggedStruct('ConfirmedDelete', {})
const CompletedEffect = S.TaggedStruct('CompletedEffect', {})
const Message = S.Union([
  Incremented,
  OpenedDetail,
  OpenedDeletePrompt,
  ConfirmedDelete,
  CompletedEffect,
])
type Message = typeof Message.Type

const ClickedIncrement = S.TaggedStruct('ClickedIncrement', {
  occurrenceId: S.String,
})
const ClickedOpenDetail = S.TaggedStruct('ClickedOpenDetail', {
  occurrenceId: S.String,
})
const ClickedOpenDeletePrompt = S.TaggedStruct('ClickedOpenDeletePrompt', {
  occurrenceId: S.String,
})
const ClickedConfirmDelete = S.TaggedStruct('ClickedConfirmDelete', {
  occurrenceId: S.String,
})
const Claim = S.Union([
  ClickedIncrement,
  ClickedOpenDetail,
  ClickedOpenDeletePrompt,
  ClickedConfirmDelete,
])
type Claim = typeof Claim.Type

class ClaimDecodeError extends Data.TaggedError('ClaimDecodeError')<{
  readonly cause: unknown
}> {}

class ClaimResolutionError extends Data.TaggedError('ClaimResolutionError')<{
  readonly reason: string
}> {}

const commandExecutions = { value: 0 }
type ProgramUpdate = readonly [
  Model,
  ReadonlyArray<Program.ProgramCommand<Message>>,
]
const programSynchronization: Program.ProgramSynchronization<Model, Message> = {
  messageCategory: message =>
    message._tag === 'OpenedDetail' || message._tag === 'OpenedDeletePrompt'
      ? 'Navigation'
      : 'Domain',
  projectDomain: model => ({ count: model.count }),
}

const program = Program.make<Model, Message>({
  id: 'authority-counter',
  version: 1,
  Model,
  Message,
  init: () => [
    Model.make({ count: 0, deletePrompt: 'Closed', navigation: 'List' }),
    [],
  ],
  synchronization: programSynchronization,
  update: (model, message) =>
    M.value(message).pipe(
      M.withReturnType<ProgramUpdate>(),
      M.tagsExhaustive({
        CompletedEffect: () => [
          { ...model, count: model.count + 10 },
          [
            {
              name: 'ProveAuthorityProjectionDiscardsCommands',
              effect: Effect.sync(() => {
                commandExecutions.value += 1
                return CompletedEffect.make({})
              }),
            },
          ],
        ],
        ConfirmedDelete: () => [
          {
            ...model,
            count: 0,
            deletePrompt: 'Closed',
            navigation: 'List',
          },
          [],
        ],
        Incremented: () => [{ ...model, count: model.count + 1 }, []],
        OpenedDeletePrompt: () => [{ ...model, deletePrompt: 'Open' }, []],
        OpenedDetail: () => [{ ...model, navigation: 'Detail' }, []],
      }),
    ),
})

const decodeClaim = (input: unknown): Result.Result<Claim, ClaimDecodeError> =>
  Result.mapError(
    S.decodeUnknownResult(Claim, { onExcessProperty: 'error' })(input),
    cause => new ClaimDecodeError({ cause }),
  )

const resolveClaim = (
  model: Model,
  claim: Claim,
  facts: unknown,
): Result.Result<Message, ClaimResolutionError> => {
  const invocation = S.decodeUnknownResult(V3SharedProgramInvocationFacts, {
    onExcessProperty: 'error',
  })(facts)
  if (
    Result.isFailure(invocation) ||
    invocation.success.occurrenceId !== claim.occurrenceId
  ) {
    return Result.fail(
      new ClaimResolutionError({ reason: 'InvalidInvocationFacts' }),
    )
  }
  return M.value(claim).pipe(
    M.withReturnType<Result.Result<Message, ClaimResolutionError>>(),
    M.tagsExhaustive({
      ClickedConfirmDelete: () =>
        model.deletePrompt === 'Open'
          ? Result.succeed(ConfirmedDelete.make({}))
          : Result.fail(new ClaimResolutionError({ reason: 'DeleteIsStale' })),
      ClickedIncrement: () => Result.succeed(Incremented.make({})),
      ClickedOpenDeletePrompt: () =>
        Result.succeed(OpenedDeletePrompt.make({})),
      ClickedOpenDetail: () => Result.succeed(OpenedDetail.make({})),
    }),
  )
}

const admission = Program.makeMessageAdmission({
  program,
  Claim,
  decodeClaim,
  occurrenceId: claim => claim.occurrenceId,
  resolve: resolveClaim,
})

const admissionWithUpdate = (
  update: (model: Model, message: Message) => ProgramUpdate,
) =>
  Program.makeMessageAdmission({
    program: Program.make({
      id: program.id,
      version: program.version,
      Model,
      Message,
      init: program.init,
      synchronization: programSynchronization,
      update,
    }),
    Claim,
    decodeClaim,
    occurrenceId: claim => claim.occurrenceId,
    resolve: resolveClaim,
  })

const messageProtocol = makeV3SharedProgramMessageProtocol({
  Message,
  envelopeVersion: 1,
  eventMetadata: message => ({
    eventId: `counter.${message._tag}`,
    eventVersion: 1,
  }),
})

const appSubjectDigest = 'a'.repeat(64)
const sessionEpochId = 'e'.repeat(22)
const sessionIdentity = InstantV3ProgramSessionIdentity.make({
  appSubjectDigest,
  originPolicyProtocolVersion: instantV3OriginPolicyProtocolVersion,
  programId: program.id,
  programVersion: program.version,
  sessionEpochId,
})
const scope = V3ProgramStoreScope.make({
  appSubjectDigest,
  instantAppId: 'instant-app-authority-test',
  programId: program.id,
  programVersion: program.version,
  protocolVersion: instantV3ProgramProtocolVersion,
  sessionEpochId,
  sessionId: printInstantV3ProgramSessionId(sessionIdentity),
  subjectId: 'subject-authority-test',
})

const nextUuid = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const makeOriginWith = (
  options: Readonly<{
    actorId?: string
    originPolicyId?: string
    seedOffset?: number
  }> = {},
) =>
  Effect.gen(function* () {
    const seedOffset = options.seedOffset ?? 0
    const device = yield* deriveOriginDeviceKeyPair(
      Uint8Array.from({ length: 32 }, (_, index) => index + 1 + seedOffset),
    )
    const client = yield* deriveOriginClientKeyPair(
      Uint8Array.from({ length: 32 }, (_, index) => index + 33 + seedOffset),
    )
    const processor = yield* deriveOriginProcessorKeyPair(
      Uint8Array.from({ length: 32 }, (_, index) => index + 65 + seedOffset),
    )
    const clientCertificate = yield* makeOriginClientCertificate(
      {
        clientId: client.clientId,
        instantAppId: scope.instantAppId,
        originDeviceId: device.originDeviceId,
        subjectId: scope.subjectId,
      },
      device.secretKey,
    )
    const processorCertificate = yield* makeOriginProcessorCertificate(
      {
        clientId: client.clientId,
        instantAppId: scope.instantAppId,
        originDeviceId: device.originDeviceId,
        originPolicyGeneration: 1,
        originPolicyId:
          options.originPolicyId ?? 'origin-policy-authority-test',
        originatingProcessorId: processor.originatingProcessorId,
        programId: scope.programId,
        programVersion: scope.programVersion,
        protocolVersion: scope.protocolVersion,
        sessionId: scope.sessionId,
        subjectId: scope.subjectId,
      },
      client.secretKey,
    )
    return {
      actorId: options.actorId ?? 'actor-authority-test',
      clientId: client.clientId,
      originClientCertificateJson:
        yield* encodeOriginClientCertificateJson(clientCertificate),
      originDeviceId: device.originDeviceId,
      originPolicyGeneration: 1,
      originPolicyId: options.originPolicyId ?? 'origin-policy-authority-test',
      originProcessorCertificateJson:
        yield* encodeOriginProcessorCertificateJson(processorCertificate),
      originatingProcessorId: processor.originatingProcessorId,
      processorSecretKey: processor.secretKey,
    } satisfies V3SharedProgramOrigin
  })

const makeOrigin = makeOriginWith()

const makeIdentitySourcesWith = (
  options: Readonly<{
    entitySequence?: number
    messagePrefix?: string
    occurrencePrefix?: string
    proposalPrefix?: string
    timestamp?: number
  }> = {},
) =>
  Effect.gen(function* () {
    const actorSequence = yield* Ref.make(0)
    const entitySequence = yield* Ref.make(options.entitySequence ?? 100)
    const messageSequence = yield* Ref.make(0)
    const occurrenceSequence = yield* Ref.make(0)
    const proposalSequence = yield* Ref.make(0)
    const timestamp = yield* Ref.make(options.timestamp ?? 1_753_825_000_000)
    return {
      nextActorSequence: Ref.updateAndGet(actorSequence, value => value + 1),
      nextEntityId: Ref.updateAndGet(entitySequence, value => value + 1).pipe(
        Effect.map(nextUuid),
      ),
      nextMessageIdempotencyKey: Ref.updateAndGet(
        messageSequence,
        value => value + 1,
      ).pipe(
        Effect.map(
          value => `${options.messagePrefix ?? 'message'}-${value.toString()}`,
        ),
      ),
      nextOccurrenceId: Ref.updateAndGet(
        occurrenceSequence,
        value => value + 1,
      ).pipe(
        Effect.map(
          value =>
            `${options.occurrencePrefix ?? 'occurrence'}-${value.toString()}`,
        ),
      ),
      nextProposalId: Ref.updateAndGet(
        proposalSequence,
        value => value + 1,
      ).pipe(
        Effect.map(
          value =>
            `${options.proposalPrefix ?? 'proposal'}-${value.toString()}`,
        ),
      ),
      now: Ref.updateAndGet(timestamp, value => value + 1),
    }
  })

const makeIdentitySources = makeIdentitySourcesWith()

const waitForActiveSessionPolicy = (
  processor: V3SharedProgramProcessor<Model, Claim>,
  attempts = 200,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const snapshot = yield* processor.readSnapshot
    if (Option.isSome(snapshot.activeSessionPolicy)) {
      return
    }
    if (attempts <= 0) {
      return yield* Effect.die(
        new Error('Processor did not observe the active session policy.'),
      )
    }
    yield* Effect.yieldNow
    return yield* waitForActiveSessionPolicy(processor, attempts - 1)
  })

type ModeFactory = (origin: V3SharedProgramOrigin) => Synchronization.Mode

const makeFixture = (
  modeFactory: ModeFactory = () => Synchronization.SharedDomain.make({}),
) =>
  Effect.gen(function* () {
    commandExecutions.value = 0
    const stores = yield* makeV3InMemoryProgramStores()
    const origin = yield* makeOrigin
    const sessionPolicy = Synchronization.SessionPolicy.make({
      generation: 1,
      mode: modeFactory(origin),
    })
    const session = InstantV3ProgramSessionRecord.make({
      ...scope,
      authorityProcessorId: 'authority-processor',
      createdAtMs: 1_753_824_999_900,
      id: nextUuid(800),
      lifecycleGeneration: 1,
      lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
        scope.sessionId,
        1,
      ),
      lifecycleState: 'Active',
      originPolicyProtocolVersion: instantV3OriginPolicyProtocolVersion,
      previousLifecyclePositionKey: null,
      processorRoomId: 'processor-room-authority-test',
      sessionPolicy,
    })
    const policyPositionKey = makeInstantV3OriginPolicyDecisionPositionKey(
      scope.instantAppId,
      scope.subjectId,
      scope.protocolVersion,
      origin.originPolicyId,
      1,
    )
    const originPolicy = InstantV3OriginPolicyDecisionRecord.make({
      decidedAtMs: 1_753_824_999_901,
      decidingProcessorId: 'policy-authority',
      decision: InstantV3ActiveOriginPolicyDecision.make({}),
      decisionId: policyPositionKey,
      decisionState: 'Active',
      enrollmentClaimId: 'enrollment-claim-authority-test',
      enrollmentClaimPositionKey: makeInstantV3OriginEnrollmentClaimPositionKey(
        scope.instantAppId,
        scope.subjectId,
        scope.protocolVersion,
        'enrollment-claim-authority-test',
      ),
      generation: 1,
      id: nextUuid(801),
      instantAppId: scope.instantAppId,
      originDeviceId: origin.originDeviceId,
      originPolicyId: origin.originPolicyId,
      positionKey: policyPositionKey,
      previousDecisionId: null,
      protocolVersion: scope.protocolVersion,
      subjectId: scope.subjectId,
    })
    yield* stores.authority.appendServerConfirmedProgramSession(session)
    yield* stores.authority.appendServerConfirmedOriginPolicyDecision(
      originPolicy,
    )
    const identities = yield* makeIdentitySources
    const processor = yield* makeV3SharedProgramProcessor({
      admission,
      identities,
      messageProtocol,
      origin,
      scope,
      store: stores.client,
    })
    yield* processor.connect
    yield* Effect.addFinalizer(() => processor.disconnect)
    yield* waitForActiveSessionPolicy(processor)
    const authorityValues = {
      entity: 900,
      timestamp: 1_753_825_100_000,
    }
    const definition: V3AcceptanceAuthorityDefinition<
      Model,
      Message,
      Claim,
      ClaimDecodeError,
      ClaimResolutionError
    > = {
      acceptingProcessorId: session.authorityProcessorId,
      admission,
      makeEntityId: () =>
        InstantV3EntityId.make(nextUuid(authorityValues.entity++)),
      now: () => InstantV3TimestampMs.make(authorityValues.timestamp++),
      scope,
      wire: messageProtocol,
    }
    const authority = yield* makeV3AcceptanceAuthority({
      ...definition,
      store: stores.authority,
    })
    return {
      authority,
      definition,
      origin,
      originPolicy,
      processor,
      session,
      sessionPolicy,
      stores,
    }
  })

const makeGatedAuthority = (
  fixture: Effect.Success<ReturnType<typeof makeFixture>>,
) =>
  Effect.gen(function* () {
    const envelopeStarted = yield* Deferred.make<void>()
    const releaseEnvelope = yield* Deferred.make<void>()
    const wire: V3SharedProgramMessageProtocol<Message> = {
      ...messageProtocol,
      makeAcceptedEnvelope: (proposal, input) =>
        Effect.gen(function* () {
          yield* Deferred.succeed(envelopeStarted, undefined)
          yield* Deferred.await(releaseEnvelope)
          return yield* messageProtocol.makeAcceptedEnvelope(proposal, input)
        }),
    }
    const authority = yield* makeV3AcceptanceAuthority({
      ...fixture.definition,
      store: fixture.stores.authority,
      wire,
    })
    return { authority, envelopeStarted, releaseEnvelope }
  })

const admitBeforeAuthorityMutation = (
  fixture: Effect.Success<ReturnType<typeof makeFixture>>,
  proposalId: string,
  mutation: Effect.Effect<unknown, unknown>,
) =>
  Effect.gen(function* () {
    const gated = yield* makeGatedAuthority(fixture)
    const admissionFiber = yield* Effect.forkChild(
      gated.authority.admit(proposalId),
    )
    yield* Deferred.await(gated.envelopeStarted)
    const mutationStarted = yield* Deferred.make<void>()
    const mutationFiber = yield* Effect.forkChild(
      Effect.gen(function* () {
        yield* Deferred.succeed(mutationStarted, undefined)
        return yield* mutation
      }),
    )
    yield* Deferred.await(mutationStarted)
    yield* Effect.yieldNow
    expect(mutationFiber.pollUnsafe()).toBeUndefined()
    yield* Deferred.succeed(gated.releaseEnvelope, undefined)
    const admissionOutcome = yield* Fiber.join(admissionFiber)
    const mutationOutcome = yield* Fiber.join(mutationFiber)
    return { admissionOutcome, mutationOutcome }
  })

const ordinaryOccurrence = (
  occurrence: InstantV3AcceptedMessageOccurrenceRecord,
): InstantV3AcceptedOrdinaryMessageOccurrenceRecord => {
  if (occurrence.proposalKind === 'OrdinaryMessage') {
    return occurrence
  }
  throw new Error('Expected an ordinary accepted occurrence.')
}

const makeAcceptedHistory = (
  template: typeof InstantV3OrdinaryMessageProposalRecord.Type,
  count: number,
  acceptedSessionPolicy: Synchronization.SessionPolicy,
  acceptingProcessorId: string,
) =>
  Effect.forEach(Array.range(1, count), acceptedSequence =>
    Effect.gen(function* () {
      const actorId = 'history-actor'
      const occurrenceId = `history-occurrence-${acceptedSequence.toString()}`
      const messageIdempotencyKey = `history-message-${acceptedSequence.toString()}`
      const proposalId = `history-proposal-${acceptedSequence.toString()}`
      const createdAtMs = template.createdAtMs + acceptedSequence
      const encoded = yield* messageProtocol.encodeProposed(
        Incremented.make({}),
        {
          actorId,
          actorSequence: acceptedSequence,
          causationOccurrenceId: null,
          clientId: template.clientId,
          correlationId: null,
          createdAtMs,
          occurrenceId,
          originDeviceId: template.originDeviceId,
          originatingProcessorId: template.originatingProcessorId,
          programId: scope.programId,
          programVersion: scope.programVersion,
          protocolVersion: scope.protocolVersion,
          sessionId: scope.sessionId,
          subjectId: scope.subjectId,
        },
      )
      const proposal = InstantV3OrdinaryMessageProposalRecord.make({
        ...template,
        actorId,
        actorSequence: acceptedSequence,
        actorSequencePositionKey:
          makeInstantV3MessageProposalActorSequencePositionKey(
            scope.sessionId,
            actorId,
            template.clientId,
            acceptedSequence,
          ),
        admissionOccurrenceId: occurrenceId,
        causationOccurrenceId: null,
        correlationId: null,
        createdAtMs,
        envelopeJson: encoded.envelopeJson,
        envelopeVersion: encoded.envelopeVersion,
        eventId: encoded.eventId,
        eventVersion: encoded.eventVersion,
        id: nextUuid(100_000 + acceptedSequence),
        messageIdempotencyKey,
        messageIdempotencyPositionKey:
          makeInstantV3MessageProposalMessageIdempotencyPositionKey(
            scope.sessionId,
            messageIdempotencyKey,
          ),
        occurrenceId,
        occurrencePositionKey:
          makeInstantV3MessageProposalOccurrencePositionKey(
            scope.sessionId,
            occurrenceId,
          ),
        payloadJson: encoded.payloadJson,
        proposalId,
        proposalPositionKey: makeInstantV3MessageProposalPositionKey(
          scope.sessionId,
          proposalId,
        ),
      })
      const acceptedAtMs = createdAtMs + 1
      const audience = Synchronization.SessionAudience.make({})
      const envelopeJson = yield* messageProtocol.acceptEnvelope(proposal, {
        acceptedAtMs,
        acceptedSequence,
        acceptingProcessorId,
        audience,
        messageCategory: 'Domain',
        policyGeneration: acceptedSessionPolicy.generation,
        sessionPolicy: acceptedSessionPolicy,
      })
      return InstantV3AcceptedOrdinaryMessageOccurrenceRecord.make({
        ...proposal,
        acceptedAtMs,
        acceptedSequence,
        acceptedSequencePositionKey: makeInstantV3AcceptedSequencePositionKey(
          scope.sessionId,
          acceptedSequence,
        ),
        acceptingProcessorId,
        actorSequencePositionKey: makeInstantV3AcceptedActorSequencePositionKey(
          scope.sessionId,
          actorId,
          template.clientId,
          acceptedSequence,
        ),
        audience,
        causationId: null,
        envelopeJson,
        id: nextUuid(200_000 + acceptedSequence),
        messageCategory: 'Domain',
        messageIdempotencyPositionKey:
          makeInstantV3AcceptedMessageIdempotencyPositionKey(
            scope.sessionId,
            messageIdempotencyKey,
          ),
        occurrencePositionKey: makeInstantV3AcceptedOccurrencePositionKey(
          scope.sessionId,
          occurrenceId,
        ),
        policyGeneration: acceptedSessionPolicy.generation,
        positionKey: makeInstantV3AcceptedSequencePositionKey(
          scope.sessionId,
          acceptedSequence,
        ),
        proposedEnvelopeJson: proposal.envelopeJson,
        proposalPositionKey: makeInstantV3AcceptedProposalPositionKey(
          scope.sessionId,
          proposalId,
        ),
        sessionPolicy: acceptedSessionPolicy,
      })
    }),
  )

const makeControlledAuthorityStore = (
  base: V3ProgramAuthorityStoreService,
  initialSnapshot: V3AcceptanceAuthoritySnapshot,
) =>
  Effect.gen(function* () {
    const snapshotRef = yield* Ref.make(initialSnapshot)
    const semaphore = yield* Semaphore.make(1)
    const appendAccepted: V3ProgramAuthorityStoreService['appendServerConfirmedAcceptedMessageOccurrence'] =
      transaction =>
        Ref.update(snapshotRef, snapshot => ({
          ...snapshot,
          acceptedMessageOccurrences: Array.append(
            snapshot.acceptedMessageOccurrences,
            transaction.occurrence,
          ),
          messageProposalResolutions: Array.append(
            snapshot.messageProposalResolutions,
            transaction.resolution,
          ),
        })).pipe(
          Effect.as(
            v3ServerConfirmedTransactionOutcome(
              `controlled-accepted-${transaction.occurrence.id}`,
              'Appended',
            ),
          ),
        )
    const appendRejected: V3ProgramAuthorityStoreService['appendServerConfirmedRejectedMessageProposalResolution'] =
      resolution =>
        Ref.update(snapshotRef, snapshot => ({
          ...snapshot,
          messageProposalResolutions: Array.append(
            snapshot.messageProposalResolutions,
            resolution,
          ),
        })).pipe(
          Effect.as(
            v3ServerConfirmedTransactionOutcome(
              `controlled-rejected-${resolution.id}`,
              'Appended',
            ),
          ),
        )
    const mutations = {
      ...base,
      appendServerConfirmedAcceptedMessageOccurrence: appendAccepted,
      appendServerConfirmedRejectedMessageProposalResolution: appendRejected,
    }
    const coordinator: V3ProgramAuthorityStoreService['coordinator'] = {
      capability: V3ProgramAuthorityCoordinatorCapability.make({
        protocolVersion: 3,
      }),
      withCriticalSection: use =>
        semaphore.withPermit(
          Effect.gen(function* () {
            const invocation =
              yield* makeV3ProgramAuthorityCriticalSectionInvocation({
                ...mutations,
                readServerConfirmedSnapshot: () => Ref.get(snapshotRef),
              })
            return yield* use(invocation.section).pipe(
              Effect.ensuring(invocation.expire),
            )
          }),
        ),
    }
    return {
      snapshotRef,
      store: {
        ...mutations,
        authorityCapability: V3ProgramAuthorityStoreCapability.make({
          protocolVersion: 3,
        }),
        coordinator,
      } satisfies V3ProgramAuthorityStoreService,
    }
  })

const proofDigestForAcceptedOccurrence = (
  occurrence: InstantV3AcceptedMessageOccurrenceRecord,
  proposal: typeof InstantV3MessageProposalRecord.Type,
): Effect.Effect<string> => {
  if (occurrence.proposalKind === 'EffectResult') {
    if (proposal.proposalKind !== 'EffectResult') {
      return Effect.die(
        new Error('Expected the retained EffectResult proposal.'),
      )
    }
    return Effect.succeed(occurrence.causalOriginProofDigest)
  } else if (proposal.proposalKind === 'OrdinaryMessage') {
    return digestOriginOrdinaryMessageProposalProof(proposal).pipe(Effect.orDie)
  } else {
    return Effect.die(new Error('Expected the retained ordinary proposal.'))
  }
}

const appendEffectResultProposal = (
  fixture: Effect.Success<ReturnType<typeof makeFixture>>,
  causal: InstantV3AcceptedMessageOccurrenceRecord,
  options: Readonly<{
    appendedAssignmentGeneration?: number
    effectIndex?: number
    proposedAssignmentGeneration?: number
  }> = {},
) =>
  Effect.gen(function* () {
    const effectIndex = options.effectIndex ?? 1
    const identitySuffix = effectIndex === 1 ? '' : `-${effectIndex.toString()}`
    const entityOffset = (effectIndex - 1) * 10
    const requestId = `effect-request-authority-test${identitySuffix}`
    const effectIdempotencyKey = `effect-idempotency-authority-test${identitySuffix}`
    const appendedAssignmentGeneration =
      options.appendedAssignmentGeneration ?? 1
    const proposedAssignmentGeneration =
      options.proposedAssignmentGeneration ?? appendedAssignmentGeneration
    const snapshot = yield* fixture.stores.readSnapshot
    const maybeCausalProposal = Array.findFirst(
      snapshot.messageProposals,
      proposal => proposal.proposalId === causal.proposalId,
    )
    if (Option.isNone(maybeCausalProposal)) {
      return yield* Effect.die(
        new Error('Expected the retained causal proposal.'),
      )
    }
    const causalOriginProofDigest = yield* proofDigestForAcceptedOccurrence(
      causal,
      maybeCausalProposal.value,
    )
    const causalOriginPolicyGeneration =
      causal.proposalKind === 'OrdinaryMessage'
        ? causal.originPolicyGeneration
        : causal.executorOriginPolicyGeneration
    const causalOriginPolicyId =
      causal.proposalKind === 'OrdinaryMessage'
        ? causal.originPolicyId
        : causal.executorOriginPolicyId
    const placement = Processor.Placement.make({
      affinity: Processor.AnyProcessor.make({}),
      capability: Processor.CapabilityRequirement.make({
        id: ['Counter', 'Effect'],
        minimumVersion: 1,
      }),
      cardinality: 'One',
      unavailable: 'Wait',
      version: 1,
    })
    const request = InstantV3EffectRequestRecord.make({
      ...scope,
      causalAcceptedSequence: causal.acceptedSequence,
      causalAudience: causal.audience,
      causalMessageCategory: causal.messageCategory,
      causalOccurrenceId: causal.occurrenceId,
      causalOriginDeviceId: causal.originDeviceId,
      causalOriginPolicyGeneration,
      causalOriginPolicyId,
      causalOriginProofDigest,
      causalOriginatingProcessorId: causal.originatingProcessorId,
      causalPolicyGeneration: causal.policyGeneration,
      causalProposalId: causal.proposalId,
      effectId: 'counter.effect',
      effectVersion: 1,
      id: nextUuid(600 + entityOffset),
      idempotencyKey: effectIdempotencyKey,
      idempotencyPositionKey: makeInstantV3EffectRequestIdempotencyPositionKey(
        scope.sessionId,
        effectIdempotencyKey,
      ),
      minimumCapabilityVersion: 1,
      originatingProcessorId: causal.originatingProcessorId,
      placement,
      publicArguments: { counterId: 'counter-1' },
      permittedResultEvents: [
        Command.ResultEventRange.make({
          eventId: 'counter.CompletedEffect',
          maximumVersion: 1,
          minimumVersion: 1,
        }),
      ],
      requestId,
      requestPositionKey: makeInstantV3EffectRequestPositionKey(
        scope.sessionId,
        requestId,
      ),
      requestedAtMs: 1_753_825_000_100 + effectIndex,
      requiredCapabilityIdJson: makeInstantV3CapabilityIdIndex(
        placement.capability.id,
      ),
    })
    const appendedPlacementId = makeInstantV3EffectPlacementPositionKey(
      scope.sessionId,
      requestId,
      appendedAssignmentGeneration,
      0,
    )
    const appendedPlacement = InstantV3EffectPlacementRecord.make({
      ...scope,
      assignedProcessorId: fixture.origin.originatingProcessorId,
      assignmentGeneration: appendedAssignmentGeneration,
      cancellationGeneration: 0,
      decidedAtMs: 1_753_825_000_101 + effectIndex,
      id: nextUuid(601 + entityOffset),
      placementDecision: Processor.AssignedPreferred.make({
        processorId: fixture.origin.originatingProcessorId,
      }),
      placementId: appendedPlacementId,
      placementStatus: 'AssignedPreferred',
      positionKey: appendedPlacementId,
      requestId,
    })
    const proposedPlacementId = makeInstantV3EffectPlacementPositionKey(
      scope.sessionId,
      requestId,
      proposedAssignmentGeneration,
      0,
    )
    const commonEnvelope = {
      actorId: fixture.origin.actorId,
      actorSequence: effectIndex + 1,
      causationOccurrenceId: causal.occurrenceId,
      clientId: fixture.origin.clientId,
      correlationId: causal.correlationId,
      createdAtMs: 1_753_825_000_102 + effectIndex,
      occurrenceId: `effect-occurrence-authority-test${identitySuffix}`,
      originDeviceId: fixture.origin.originDeviceId,
      originatingProcessorId: fixture.origin.originatingProcessorId,
      programId: scope.programId,
      programVersion: scope.programVersion,
      protocolVersion: scope.protocolVersion,
      sessionId: scope.sessionId,
      subjectId: scope.subjectId,
    }
    const effectFields = {
      causalAcceptedSequence: causal.acceptedSequence,
      causalAudience: causal.audience,
      causalMessageCategory: causal.messageCategory,
      causalOccurrenceId: causal.occurrenceId,
      causalOriginDeviceId: causal.originDeviceId,
      causalOriginPolicyGeneration,
      causalOriginPolicyId,
      causalOriginProofDigest,
      causalOriginatingProcessorId: causal.originatingProcessorId,
      causalPolicyGeneration: causal.policyGeneration,
      causalProposalId: causal.proposalId,
      effectAssignmentGeneration: proposedAssignmentGeneration,
      effectCancellationGeneration: 0,
      effectIdempotencyKey,
      effectIdempotencyPositionKey:
        makeInstantV3MessageProposalEffectIdempotencyPositionKey(
          scope.sessionId,
          effectIdempotencyKey,
        ),
      effectPlacementId: proposedPlacementId,
      effectRequestId: requestId,
      effectRequestResultPositionKey:
        makeInstantV3MessageProposalEffectRequestResultPositionKey(
          scope.sessionId,
          requestId,
        ),
      executorClientCertificateJson: fixture.origin.originClientCertificateJson,
      executorOriginPolicyGeneration: fixture.origin.originPolicyGeneration,
      executorOriginPolicyId: fixture.origin.originPolicyId,
      executorProcessorCertificateJson:
        fixture.origin.originProcessorCertificateJson,
      executorProcessorId: fixture.origin.originatingProcessorId,
    }
    const envelopeInput: V3SharedProgramProposedEffectResultEnvelopeInput = {
      ...commonEnvelope,
      ...effectFields,
    }
    const encoded = yield* messageProtocol.encodeEffectResultProposed(
      CompletedEffect.make({}),
      envelopeInput,
    )
    const proposalId = `effect-proposal-authority-test${identitySuffix}`
    const signingRecord = OriginEffectResultSigningRecord.make({
      ...scope,
      ...commonEnvelope,
      ...effectFields,
      actorSequencePositionKey:
        makeInstantV3MessageProposalActorSequencePositionKey(
          scope.sessionId,
          commonEnvelope.actorId,
          commonEnvelope.clientId,
          commonEnvelope.actorSequence,
        ),
      envelopeJson: encoded.envelopeJson,
      envelopeVersion: encoded.envelopeVersion,
      eventId: encoded.eventId,
      eventVersion: encoded.eventVersion,
      id: nextUuid(602 + entityOffset),
      occurrencePositionKey: makeInstantV3MessageProposalOccurrencePositionKey(
        scope.sessionId,
        commonEnvelope.occurrenceId,
      ),
      payloadJson: encoded.payloadJson,
      proposalId,
      proposalKind: 'EffectResult',
      proposalPositionKey: makeInstantV3MessageProposalPositionKey(
        scope.sessionId,
        proposalId,
      ),
    })
    const proposal = yield* signOriginEffectResultProposal(
      signingRecord,
      fixture.origin.processorSecretKey,
    )
    yield* fixture.stores.authority.appendServerConfirmedEffectRequest(request)
    yield* fixture.stores.authority.appendServerConfirmedEffectPlacement(
      appendedPlacement,
    )
    yield* fixture.stores.client.appendMessageProposal(proposal)
    return { appendedPlacement, proposal, request }
  })

describe('protocol-v3 acceptance authority', () => {
  it.effect('accepts a signed ordinary claim and retains its proposal', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const submission = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      const outcome = yield* fixture.authority.admit(
        submission.proposal.proposalId,
      )
      expect(outcome._tag).toBe('Accepted')
      if (outcome._tag !== 'Accepted') {
        return
      }
      expect(outcome.writeDisposition).toBe('Appended')
      expect(outcome.occurrence.acceptedSequence).toBe(1)
      expect(outcome.occurrence.audience._tag).toBe('SessionAudience')
      expect(outcome.occurrence.messageCategory).toBe('Domain')
      expect(outcome.occurrence.policyGeneration).toBe(
        fixture.sessionPolicy.generation,
      )
      expect(outcome.occurrence.sessionPolicy).toEqual(fixture.sessionPolicy)

      const snapshot = yield* fixture.stores.readSnapshot
      expect(snapshot.messageProposals).toHaveLength(1)
      expect(snapshot.messageProposalResolutions).toHaveLength(1)
      expect(snapshot.acceptedMessageOccurrences).toHaveLength(1)
      const maybeProposal = Array.head(snapshot.messageProposals)
      expect(Option.isSome(maybeProposal)).toBe(true)
      if (Option.isSome(maybeProposal)) {
        expect(maybeProposal.value).toEqual(submission.proposal)
      }
    }),
  )

  it.effect(
    'accepts after a 1,024-Message history without replaying that history again',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture()
        const authorityUpdateCount = { value: 0 }
        const authorityAdmission = admissionWithUpdate((model, message) => {
          authorityUpdateCount.value += 1
          return program.update(model, message)
        })
        const firstSubmission = yield* fixture.processor.submitAction(
          occurrenceId => ClickedIncrement.make({ occurrenceId }),
        )
        const acceptedHistory = yield* makeAcceptedHistory(
          firstSubmission.proposal,
          1_024,
          fixture.sessionPolicy,
          fixture.session.authorityProcessorId,
        )
        const controlled = yield* makeControlledAuthorityStore(
          fixture.stores.authority,
          V3AcceptanceAuthoritySnapshot.make({
            acceptedMessageOccurrences: acceptedHistory,
            effectPlacements: [],
            effectRequests: [],
            messageProposalResolutions: [],
            messageProposals: [firstSubmission.proposal],
            originPolicyDecisions: [fixture.originPolicy],
            programSessions: [fixture.session],
          }),
        )
        const authority = yield* makeV3AcceptanceAuthority({
          ...fixture.definition,
          admission: authorityAdmission,
          store: controlled.store,
        })
        const firstOutcome = yield* authority.admit(
          firstSubmission.proposal.proposalId,
        )
        expect(firstOutcome._tag).toBe('Accepted')
        if (firstOutcome._tag !== 'Accepted') {
          return
        }
        expect(firstOutcome.occurrence.acceptedSequence).toBe(1_025)

        const secondSubmission = yield* fixture.processor.submitAction(
          occurrenceId => ClickedIncrement.make({ occurrenceId }),
        )
        yield* Ref.update(controlled.snapshotRef, snapshot => ({
          ...snapshot,
          messageProposals: Array.append(
            snapshot.messageProposals,
            secondSubmission.proposal,
          ),
        }))
        const secondOutcome = yield* authority.admit(
          secondSubmission.proposal.proposalId,
        )
        expect(secondOutcome._tag).toBe('Accepted')
        if (secondOutcome._tag !== 'Accepted') {
          return
        }
        expect(secondOutcome.occurrence.acceptedSequence).toBe(1_026)
        expect(authorityUpdateCount.value).toBe(1_027)
      }),
    { timeout: 20_000 },
  )

  it.effect(
    'returns the same terminal idempotently without deleting intake',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture()
        const submission = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const first = yield* fixture.authority.admit(
          submission.proposal.proposalId,
        )
        const second = yield* fixture.authority.admit(
          submission.proposal.proposalId,
        )
        expect(first._tag).toBe('Accepted')
        expect(second._tag).toBe('Accepted')
        if (first._tag !== 'Accepted' || second._tag !== 'Accepted') {
          return
        }
        expect(second.writeDisposition).toBe('Idempotent')
        expect(second.occurrence).toEqual(first.occurrence)
        const snapshot = yield* fixture.stores.readSnapshot
        expect(snapshot.messageProposals).toHaveLength(1)
        expect(snapshot.messageProposalResolutions).toHaveLength(1)
        expect(snapshot.acceptedMessageOccurrences).toHaveLength(1)
      }),
  )

  it.effect('defers when an atomic terminal query is temporarily behind', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const submission = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      yield* fixture.authority.admit(submission.proposal.proposalId)
      const snapshot = yield* fixture.authority.readServerConfirmedSnapshot
      const evaluation = yield* evaluateV3AcceptanceAuthorityProposal(
        fixture.definition,
        { ...snapshot, messageProposalResolutions: [] },
        submission.proposal,
      )
      expect(evaluation).toEqual({
        _tag: 'Deferred',
        proposalId: submission.proposal.proposalId,
        reason: 'AcceptedOccurrencePending',
      })
    }),
  )

  it.effect(
    'reports corrupted accepted envelopes as typed history failure',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture()
        const submission = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const outcome = yield* fixture.authority.admit(
          submission.proposal.proposalId,
        )
        expect(outcome._tag).toBe('Accepted')
        if (
          outcome._tag !== 'Accepted' ||
          outcome.occurrence.proposalKind !== 'OrdinaryMessage'
        ) {
          return
        }
        const corrupted = InstantV3AcceptedOrdinaryMessageOccurrenceRecord.make(
          {
            ...outcome.occurrence,
            envelopeJson: outcome.occurrence.proposedEnvelopeJson,
          },
        )
        const failure = yield* Effect.flip(
          projectV3AcceptanceAuthorityModel(
            fixture.definition,
            [corrupted],
            fixture.origin.originatingProcessorId,
          ),
        )
        expect(failure._tag).toBe('V3AcceptanceAuthorityHistoryError')
        if (failure._tag === 'V3AcceptanceAuthorityHistoryError') {
          expect(failure.reason).toBe('AcceptedEnvelopeInvalid')
        }
      }),
  )

  it.effect(
    'reconstructs each Processor from global sequence while filtering Audience and discarding Commands',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture()
        const increment = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        yield* fixture.authority.admit(increment.proposal.proposalId)
        const detail = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedOpenDetail.make({ occurrenceId }),
        )
        yield* fixture.authority.admit(detail.proposal.proposalId)
        const snapshot = yield* fixture.stores.readSnapshot
        const originProjection = yield* projectV3AcceptanceAuthorityModel(
          fixture.definition,
          snapshot.acceptedMessageOccurrences,
          fixture.origin.originatingProcessorId,
        )
        const otherProjection = yield* projectV3AcceptanceAuthorityModel(
          fixture.definition,
          snapshot.acceptedMessageOccurrences,
          'other-processor',
        )
        expect(originProjection.throughAcceptedSequence).toBe(2)
        expect(otherProjection.throughAcceptedSequence).toBe(2)
        expect(originProjection.model).toEqual({
          count: 1,
          deletePrompt: 'Closed',
          navigation: 'Detail',
        })
        expect(otherProjection.model).toEqual({
          count: 1,
          deletePrompt: 'Closed',
          navigation: 'List',
        })
        expect(commandExecutions.value).toBe(0)
      }),
  )

  it.effect(
    'resolves claims against accepted pre-row state, not optimism',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture()
        const opened = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedOpenDeletePrompt.make({ occurrenceId }),
        )
        const confirmed = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedConfirmDelete.make({ occurrenceId }),
        )
        const rejected = yield* fixture.authority.admit(
          confirmed.proposal.proposalId,
        )
        expect(rejected._tag).toBe('Rejected')
        if (rejected._tag !== 'Rejected') {
          return
        }
        expect(rejected.resolution.rejectionReason).toBe(
          'AdmissionClaimRejected',
        )
        const accepted = yield* fixture.authority.admit(
          opened.proposal.proposalId,
        )
        expect(accepted._tag).toBe('Accepted')
      }),
  )

  it.effect('processes available proposals in actor order', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      yield* fixture.processor.submitAction(occurrenceId =>
        ClickedOpenDeletePrompt.make({ occurrenceId }),
      )
      yield* fixture.processor.submitAction(occurrenceId =>
        ClickedConfirmDelete.make({ occurrenceId }),
      )
      const outcomes = yield* fixture.authority.processAvailable
      expect(outcomes).toHaveLength(2)
      expect(
        Array.every(outcomes, outcome => outcome._tag === 'Accepted'),
      ).toBe(true)
      const snapshot = yield* fixture.stores.readSnapshot
      expect(snapshot.acceptedMessageOccurrences).toHaveLength(2)
      expect(snapshot.messageProposals).toHaveLength(2)
    }),
  )

  it.effect(
    'accepts actor-sequence holes but rejects a late lower replay after restart',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture()
        const lower = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const higher = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )

        const accepted = yield* fixture.authority.admit(
          higher.proposal.proposalId,
        )
        expect(accepted._tag).toBe('Accepted')

        const restartedAuthority = yield* makeV3AcceptanceAuthority({
          ...fixture.definition,
          store: fixture.stores.authority,
        })
        const replay = yield* restartedAuthority.admit(
          lower.proposal.proposalId,
        )
        expect(replay._tag).toBe('Rejected')
        if (replay._tag !== 'Rejected') {
          return
        }
        expect(replay.resolution.rejectionReason).toBe('IdentityConflict')
      }),
  )

  it.effect('keeps equal actor sequences independent across Clients', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const otherOrigin = yield* makeOriginWith({
        originPolicyId: 'origin-policy-authority-test-other-client',
        seedOffset: 96,
      })
      const policyPositionKey = makeInstantV3OriginPolicyDecisionPositionKey(
        scope.instantAppId,
        scope.subjectId,
        scope.protocolVersion,
        otherOrigin.originPolicyId,
        1,
      )
      yield* fixture.stores.authority.appendServerConfirmedOriginPolicyDecision(
        InstantV3OriginPolicyDecisionRecord.make({
          ...fixture.originPolicy,
          decisionId: policyPositionKey,
          enrollmentClaimId: 'enrollment-claim-authority-test-other-client',
          enrollmentClaimPositionKey:
            makeInstantV3OriginEnrollmentClaimPositionKey(
              scope.instantAppId,
              scope.subjectId,
              scope.protocolVersion,
              'enrollment-claim-authority-test-other-client',
            ),
          id: nextUuid(805),
          originDeviceId: otherOrigin.originDeviceId,
          originPolicyId: otherOrigin.originPolicyId,
          positionKey: policyPositionKey,
        }),
      )
      const otherIdentities = yield* makeIdentitySourcesWith({
        entitySequence: 300,
        messagePrefix: 'other-message',
        occurrencePrefix: 'other-occurrence',
        proposalPrefix: 'other-proposal',
        timestamp: 1_753_826_000_000,
      })
      const otherProcessor = yield* makeV3SharedProgramProcessor({
        admission,
        identities: otherIdentities,
        messageProtocol,
        origin: otherOrigin,
        scope,
        store: fixture.stores.client,
      })
      yield* otherProcessor.connect
      yield* Effect.addFinalizer(() => otherProcessor.disconnect)
      yield* waitForActiveSessionPolicy(otherProcessor)

      const first = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      const second = yield* otherProcessor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      expect(first.proposal.actorId).toBe(second.proposal.actorId)
      expect(first.proposal.actorSequence).toBe(second.proposal.actorSequence)
      expect(first.proposal.clientId).not.toBe(second.proposal.clientId)
      expect(first.proposal.actorSequencePositionKey).not.toBe(
        second.proposal.actorSequencePositionKey,
      )

      const firstOutcome = yield* fixture.authority.admit(
        first.proposal.proposalId,
      )
      const secondOutcome = yield* fixture.authority.admit(
        second.proposal.proposalId,
      )
      expect(firstOutcome._tag).toBe('Accepted')
      expect(secondOutcome._tag).toBe('Accepted')
    }),
  )

  it.effect('checks scope before returning a persisted terminal', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const submission = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      yield* fixture.authority.admit(submission.proposal.proposalId)
      const snapshot = yield* fixture.authority.readServerConfirmedSnapshot
      const evaluation = yield* evaluateV3AcceptanceAuthorityProposal(
        {
          ...fixture.definition,
          scope: V3ProgramStoreScope.make({
            ...scope,
            subjectId: 'foreign-subject',
          }),
        },
        snapshot,
        submission.proposal,
      )

      expect(evaluation._tag).toBe('Reject')
      if (evaluation._tag !== 'Reject') {
        return
      }
      expect(evaluation.resolution.rejectionReason).toBe('ScopeMismatch')
    }),
  )

  it.effect('audits the complete Accepted terminal pair on replay', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const submission = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      const outcome = yield* fixture.authority.admit(
        submission.proposal.proposalId,
      )
      expect(outcome._tag).toBe('Accepted')
      if (outcome._tag !== 'Accepted') {
        return
      }
      const snapshot = yield* fixture.authority.readServerConfirmedSnapshot
      const corruptedResolution =
        InstantV3AcceptedMessageProposalResolutionRecord.make({
          ...outcome.resolution,
          acceptedAtMs: outcome.resolution.acceptedAtMs + 1,
        })
      const failure = yield* Effect.flip(
        evaluateV3AcceptanceAuthorityProposal(
          fixture.definition,
          V3AcceptanceAuthoritySnapshot.make({
            ...snapshot,
            messageProposalResolutions: [corruptedResolution],
          }),
          submission.proposal,
        ),
      )

      expect(failure).toMatchObject({
        _tag: 'V3AcceptanceAuthorityTerminalHistoryError',
        proposalId: submission.proposal.proposalId,
        reason: 'AcceptedOccurrenceMismatch',
      })
    }),
  )

  it.effect(
    'rejects a missing Accepted reference when the proposal occurrence is present',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture()
        const submission = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const outcome = yield* fixture.authority.admit(
          submission.proposal.proposalId,
        )
        expect(outcome._tag).toBe('Accepted')
        if (outcome._tag !== 'Accepted') {
          return
        }
        const snapshot = yield* fixture.authority.readServerConfirmedSnapshot
        const corruptedResolution =
          InstantV3AcceptedMessageProposalResolutionRecord.make({
            ...outcome.resolution,
            acceptedMessageOccurrenceId: nextUuid(999),
            acceptedMessageOccurrencePositionKey:
              makeInstantV3AcceptedSequencePositionKey(scope.sessionId, 999),
          })
        const failure = yield* Effect.flip(
          evaluateV3AcceptanceAuthorityProposal(
            fixture.definition,
            V3AcceptanceAuthoritySnapshot.make({
              ...snapshot,
              messageProposalResolutions: [corruptedResolution],
            }),
            submission.proposal,
          ),
        )

        expect(failure).toMatchObject({
          _tag: 'V3AcceptanceAuthorityTerminalHistoryError',
          proposalId: submission.proposal.proposalId,
          reason: 'AcceptedOccurrenceMismatch',
        })
      }),
  )

  it.effect('rejects a malformed origin proof without throwing', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const submission = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      const malformed = InstantV3OrdinaryMessageProposalRecord.make({
        ...submission.proposal,
        originProposalSignature: 'A'.repeat(86),
      })
      const snapshot = yield* fixture.authority.readServerConfirmedSnapshot
      const evaluation = yield* evaluateV3AcceptanceAuthorityProposal(
        fixture.definition,
        { ...snapshot, messageProposals: [malformed] },
        malformed,
      )
      expect(evaluation._tag).toBe('Reject')
      if (evaluation._tag !== 'Reject') {
        return
      }
      expect(evaluation.resolution.rejectionReason).toBe('OriginProofInvalid')
    }),
  )

  it.effect('contains admission callback defects as a safe rejection', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const submission = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      const defectiveAdmission = Program.makeMessageAdmission({
        ...admission,
        occurrenceId: () => {
          throw new Error('Occurrence callback defect.')
        },
      })
      const authority = yield* makeV3AcceptanceAuthority({
        ...fixture.definition,
        admission: defectiveAdmission,
        store: fixture.stores.authority,
      })
      const outcome = yield* authority.admit(submission.proposal.proposalId)
      expect(outcome._tag).toBe('Rejected')
      if (outcome._tag !== 'Rejected') {
        return
      }
      expect(outcome.resolution.rejectionReason).toBe('AdmissionClaimInvalid')
    }),
  )

  it.effect('rejects an ordinary Message whose Program update throws', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const submission = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      const defectiveAdmission = admissionWithUpdate(() => {
        throw new Error('Candidate update defect.')
      })
      const authority = yield* makeV3AcceptanceAuthority({
        ...fixture.definition,
        admission: defectiveAdmission,
        store: fixture.stores.authority,
      })
      const outcome = yield* authority.admit(submission.proposal.proposalId)
      expect(outcome._tag).toBe('Rejected')
      if (outcome._tag !== 'Rejected') {
        return
      }
      expect(outcome.resolution.rejectionReason).toBe('AdmissionClaimRejected')
      const snapshot = yield* fixture.stores.readSnapshot
      expect(snapshot.acceptedMessageOccurrences).toHaveLength(0)
    }),
  )

  it.effect('blocks Observe follower navigation before append', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture(origin =>
        Synchronization.Follow.make({
          followers: [
            Synchronization.Follower.make({
              control: 'Observe',
              processorId: origin.originatingProcessorId,
            }),
          ],
          leaderProcessorId: 'leader-processor',
        }),
      )
      const navigation = yield* Effect.result(
        fixture.processor.submitAction(occurrenceId =>
          ClickedOpenDetail.make({ occurrenceId }),
        ),
      )
      expect(Result.isFailure(navigation)).toBe(true)
      if (Result.isFailure(navigation)) {
        expect(navigation.failure).toBeInstanceOf(
          V3SharedProgramSynchronizationPreflightError,
        )
        if (
          navigation.failure instanceof
          V3SharedProgramSynchronizationPreflightError
        ) {
          expect(navigation.failure.reason).toBe('ReadOnlyFollower')
        }
      }
      const snapshot = yield* fixture.stores.readSnapshot
      expect(snapshot.messageProposals).toHaveLength(0)
    }),
  )

  it.effect(
    'rejects signed navigation after a policy change but admits domain',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture()
        const navigation = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedOpenDetail.make({ occurrenceId }),
        )
        const nextSessionPolicy = Synchronization.SessionPolicy.make({
          generation: 2,
          mode: Synchronization.Follow.make({
            followers: [
              Synchronization.Follower.make({
                control: 'Observe',
                processorId: fixture.origin.originatingProcessorId,
              }),
            ],
            leaderProcessorId: 'leader-processor',
          }),
        })
        yield* fixture.stores.authority.appendServerConfirmedProgramSession(
          InstantV3ProgramSessionRecord.make({
            ...fixture.session,
            createdAtMs: fixture.session.createdAtMs + 1,
            id: nextUuid(804),
            lifecycleGeneration: 2,
            lifecyclePositionKey:
              makeInstantV3ProgramSessionLifecyclePositionKey(
                scope.sessionId,
                2,
              ),
            previousLifecyclePositionKey: fixture.session.lifecyclePositionKey,
            sessionPolicy: nextSessionPolicy,
          }),
        )
        const rejected = yield* fixture.authority.admit(
          navigation.proposal.proposalId,
        )
        expect(rejected._tag).toBe('Rejected')
        if (rejected._tag !== 'Rejected') {
          return
        }
        expect(rejected.resolution.rejectionReason).toBe(
          'SynchronizationPolicyMismatch',
        )
        const increment = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const accepted = yield* fixture.authority.admit(
          increment.proposal.proposalId,
        )
        expect(accepted._tag).toBe('Accepted')
      }),
  )

  it.effect('uses the latest server origin-policy generation', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const submission = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      const revokedPositionKey = makeInstantV3OriginPolicyDecisionPositionKey(
        scope.instantAppId,
        scope.subjectId,
        scope.protocolVersion,
        fixture.origin.originPolicyId,
        2,
      )
      yield* fixture.stores.authority.appendServerConfirmedOriginPolicyDecision(
        InstantV3OriginPolicyDecisionRecord.make({
          ...fixture.originPolicy,
          decidedAtMs: fixture.originPolicy.decidedAtMs + 1,
          decision: InstantV3RevokedOriginPolicyDecision.make({
            reason: 'Device revoked',
          }),
          decisionId: revokedPositionKey,
          decisionState: 'Revoked',
          generation: 2,
          id: nextUuid(802),
          positionKey: revokedPositionKey,
          previousDecisionId: fixture.originPolicy.positionKey,
        }),
      )
      const outcome = yield* fixture.authority.admit(
        submission.proposal.proposalId,
      )
      expect(outcome._tag).toBe('Rejected')
      if (outcome._tag !== 'Rejected') {
        return
      }
      expect(outcome.resolution.rejectionReason).toBe('OriginPolicyDenied')
    }),
  )

  it.effect(
    'serializes admission before a concurrent Program-session revoke',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture()
        const submission = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const revokedSession = InstantV3ProgramSessionRecord.make({
          ...fixture.session,
          createdAtMs: fixture.session.createdAtMs + 1,
          id: nextUuid(806),
          lifecycleGeneration: 2,
          lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
            scope.sessionId,
            2,
          ),
          lifecycleState: 'Revoked',
          previousLifecyclePositionKey: fixture.session.lifecyclePositionKey,
        })
        const result = yield* admitBeforeAuthorityMutation(
          fixture,
          submission.proposal.proposalId,
          fixture.stores.authority.appendServerConfirmedProgramSession(
            revokedSession,
          ),
        )

        expect(result.admissionOutcome._tag).toBe('Accepted')
        expect(result.mutationOutcome).toMatchObject({
          disposition: 'Appended',
        })
      }),
  )

  it.effect(
    'serializes admission before a concurrent origin-policy revoke',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture()
        const submission = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const positionKey = makeInstantV3OriginPolicyDecisionPositionKey(
          scope.instantAppId,
          scope.subjectId,
          scope.protocolVersion,
          fixture.origin.originPolicyId,
          2,
        )
        const revokedPolicy = InstantV3OriginPolicyDecisionRecord.make({
          ...fixture.originPolicy,
          decidedAtMs: fixture.originPolicy.decidedAtMs + 1,
          decision: InstantV3RevokedOriginPolicyDecision.make({
            reason: 'Concurrent revocation',
          }),
          decisionId: positionKey,
          decisionState: 'Revoked',
          generation: 2,
          id: nextUuid(807),
          positionKey,
          previousDecisionId: fixture.originPolicy.positionKey,
        })
        const result = yield* admitBeforeAuthorityMutation(
          fixture,
          submission.proposal.proposalId,
          fixture.stores.authority.appendServerConfirmedOriginPolicyDecision(
            revokedPolicy,
          ),
        )

        expect(result.admissionOutcome._tag).toBe('Accepted')
        expect(result.mutationOutcome).toMatchObject({
          disposition: 'Appended',
        })
      }),
  )

  it.effect(
    'serializes admission before a concurrent active origin-policy replacement',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture()
        const submission = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const positionKey = makeInstantV3OriginPolicyDecisionPositionKey(
          scope.instantAppId,
          scope.subjectId,
          scope.protocolVersion,
          fixture.origin.originPolicyId,
          2,
        )
        const replacementPolicy = InstantV3OriginPolicyDecisionRecord.make({
          ...fixture.originPolicy,
          decidedAtMs: fixture.originPolicy.decidedAtMs + 1,
          decision: InstantV3ActiveOriginPolicyDecision.make({}),
          decisionId: positionKey,
          generation: 2,
          id: nextUuid(808),
          positionKey,
          previousDecisionId: fixture.originPolicy.positionKey,
        })
        const result = yield* admitBeforeAuthorityMutation(
          fixture,
          submission.proposal.proposalId,
          fixture.stores.authority.appendServerConfirmedOriginPolicyDecision(
            replacementPolicy,
          ),
        )

        expect(result.admissionOutcome._tag).toBe('Accepted')
        expect(result.mutationOutcome).toMatchObject({
          disposition: 'Appended',
        })
      }),
  )

  it.effect('turns wire validation failure into a terminal rejection', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const submission = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      const rejectingWire: V3SharedProgramMessageProtocol<Message> = {
        ...messageProtocol,
        validateProposedEnvelope: () =>
          Effect.fail(
            new V3SharedProgramMessageProtocolError({
              cause: new Error('Rejected by test wire.'),
              operation: 'ValidateProposedEnvelope',
            }),
          ),
      }
      const authority = yield* makeV3AcceptanceAuthority({
        ...fixture.definition,
        store: fixture.stores.authority,
        wire: rejectingWire,
      })
      const outcome = yield* authority.admit(submission.proposal.proposalId)
      expect(outcome._tag).toBe('Rejected')
      if (outcome._tag !== 'Rejected') {
        return
      }
      expect(outcome.resolution.rejectionReason).toBe('EnvelopeInvalid')
    }),
  )

  it.effect('inherits causal navigation routing for an EffectResult', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const navigation = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedOpenDetail.make({ occurrenceId }),
      )
      const causalOutcome = yield* fixture.authority.admit(
        navigation.proposal.proposalId,
      )
      expect(causalOutcome._tag).toBe('Accepted')
      if (causalOutcome._tag !== 'Accepted') {
        return
      }
      const causal = ordinaryOccurrence(causalOutcome.occurrence)
      const effect = yield* appendEffectResultProposal(fixture, causal)
      const outcome = yield* fixture.authority.admit(effect.proposal.proposalId)
      expect(outcome._tag).toBe('Accepted')
      if (outcome._tag !== 'Accepted') {
        return
      }
      expect(outcome.occurrence.proposalKind).toBe('EffectResult')
      expect(outcome.occurrence.acceptedSequence).toBe(2)
      expect(outcome.occurrence.messageCategory).toBe('Navigation')
      expect(outcome.occurrence.audience).toEqual(causal.audience)
      expect(outcome.occurrence.sessionPolicy).toEqual(causal.sessionPolicy)

      const snapshot = yield* fixture.stores.readSnapshot
      const originProjection = yield* projectV3AcceptanceAuthorityModel(
        fixture.definition,
        snapshot.acceptedMessageOccurrences,
        fixture.origin.originatingProcessorId,
      )
      const otherProjection = yield* projectV3AcceptanceAuthorityModel(
        fixture.definition,
        snapshot.acceptedMessageOccurrences,
        'other-processor',
      )
      expect(originProjection.model.count).toBe(10)
      expect(originProjection.model.navigation).toBe('Detail')
      expect(otherProjection.model.count).toBe(0)
      expect(otherProjection.model.navigation).toBe('List')
      expect(originProjection.throughAcceptedSequence).toBe(2)
      expect(otherProjection.throughAcceptedSequence).toBe(2)
      expect(commandExecutions.value).toBe(0)
    }),
  )

  it.effect(
    'defers a nested EffectResult while an ancestor proposal query is behind',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture()
        const increment = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const rootOutcome = yield* fixture.authority.admit(
          increment.proposal.proposalId,
        )
        expect(rootOutcome._tag).toBe('Accepted')
        if (rootOutcome._tag !== 'Accepted') {
          return
        }
        const firstEffect = yield* appendEffectResultProposal(
          fixture,
          rootOutcome.occurrence,
        )
        const firstEffectOutcome = yield* fixture.authority.admit(
          firstEffect.proposal.proposalId,
        )
        expect(firstEffectOutcome._tag).toBe('Accepted')
        if (firstEffectOutcome._tag !== 'Accepted') {
          return
        }
        const secondEffect = yield* appendEffectResultProposal(
          fixture,
          firstEffectOutcome.occurrence,
          { effectIndex: 2 },
        )
        const snapshot = yield* fixture.authority.readServerConfirmedSnapshot
        const skewedSnapshot = V3AcceptanceAuthoritySnapshot.make({
          ...snapshot,
          messageProposals: Array.filter(
            snapshot.messageProposals,
            proposal => proposal.proposalId !== increment.proposal.proposalId,
          ),
        })
        const evaluation = yield* evaluateV3AcceptanceAuthorityProposal(
          fixture.definition,
          skewedSnapshot,
          secondEffect.proposal,
        )
        expect(evaluation).toEqual({
          _tag: 'Deferred',
          proposalId: secondEffect.proposal.proposalId,
          reason: 'ProposalPending',
        })
        const accepted = yield* fixture.authority.admit(
          secondEffect.proposal.proposalId,
        )
        expect(accepted._tag).toBe('Accepted')
      }),
  )

  it.effect(
    'rejects an EffectResult whose update returns an invalid Model',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture()
        const increment = yield* fixture.processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const causalOutcome = yield* fixture.authority.admit(
          increment.proposal.proposalId,
        )
        expect(causalOutcome._tag).toBe('Accepted')
        if (causalOutcome._tag !== 'Accepted') {
          return
        }
        const effect = yield* appendEffectResultProposal(
          fixture,
          causalOutcome.occurrence,
        )
        const defectiveAdmission = admissionWithUpdate((model, message) => {
          if (message._tag === 'CompletedEffect') {
            return [
              JSON.parse(
                '{"count":"invalid","deletePrompt":"Closed","navigation":"List"}',
              ),
              [],
            ]
          }
          return program.update(model, message)
        })
        const authority = yield* makeV3AcceptanceAuthority({
          ...fixture.definition,
          admission: defectiveAdmission,
          store: fixture.stores.authority,
        })
        const outcome = yield* authority.admit(effect.proposal.proposalId)
        expect(outcome._tag).toBe('Rejected')
        if (outcome._tag !== 'Rejected') {
          return
        }
        expect(outcome.resolution.rejectionReason).toBe('EffectResultMismatch')
        const snapshot = yield* fixture.stores.readSnapshot
        expect(snapshot.acceptedMessageOccurrences).toHaveLength(1)
      }),
  )

  it.effect('defers an EffectResult whose referenced placement is ahead', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const increment = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      const causalOutcome = yield* fixture.authority.admit(
        increment.proposal.proposalId,
      )
      expect(causalOutcome._tag).toBe('Accepted')
      if (causalOutcome._tag !== 'Accepted') {
        return
      }
      const effect = yield* appendEffectResultProposal(
        fixture,
        ordinaryOccurrence(causalOutcome.occurrence),
        {
          appendedAssignmentGeneration: 1,
          proposedAssignmentGeneration: 2,
        },
      )
      const snapshot = yield* fixture.authority.readServerConfirmedSnapshot
      const evaluation = yield* evaluateV3AcceptanceAuthorityProposal(
        fixture.definition,
        snapshot,
        effect.proposal,
      )
      expect(evaluation).toEqual({
        _tag: 'Deferred',
        proposalId: effect.proposal.proposalId,
        reason: 'EffectPlacementPending',
      })
    }),
  )

  it.effect('rejects an EffectResult from a superseded placement', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const increment = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      const causalOutcome = yield* fixture.authority.admit(
        increment.proposal.proposalId,
      )
      expect(causalOutcome._tag).toBe('Accepted')
      if (causalOutcome._tag !== 'Accepted') {
        return
      }
      const effect = yield* appendEffectResultProposal(
        fixture,
        ordinaryOccurrence(causalOutcome.occurrence),
      )
      const laterPlacementId = makeInstantV3EffectPlacementPositionKey(
        scope.sessionId,
        effect.request.requestId,
        2,
        0,
      )
      yield* fixture.stores.authority.appendServerConfirmedEffectPlacement(
        InstantV3EffectPlacementRecord.make({
          ...effect.appendedPlacement,
          assignmentGeneration: 2,
          decidedAtMs: effect.appendedPlacement.decidedAtMs + 1,
          id: nextUuid(604),
          placementId: laterPlacementId,
          positionKey: laterPlacementId,
        }),
      )
      const outcome = yield* fixture.authority.admit(effect.proposal.proposalId)
      expect(outcome._tag).toBe('Rejected')
      if (outcome._tag !== 'Rejected') {
        return
      }
      expect(outcome.resolution.rejectionReason).toBe('EffectResultMismatch')
    }),
  )

  it.effect('serializes EffectResult admission before reassignment', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const increment = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      const causal = yield* fixture.authority.admit(
        increment.proposal.proposalId,
      )
      expect(causal._tag).toBe('Accepted')
      if (causal._tag !== 'Accepted') {
        return
      }
      const effect = yield* appendEffectResultProposal(
        fixture,
        causal.occurrence,
      )
      const positionKey = makeInstantV3EffectPlacementPositionKey(
        scope.sessionId,
        effect.request.requestId,
        2,
        0,
      )
      const reassignment = InstantV3EffectPlacementRecord.make({
        ...effect.appendedPlacement,
        assignmentGeneration: 2,
        decidedAtMs: effect.appendedPlacement.decidedAtMs + 1,
        id: nextUuid(809),
        placementId: positionKey,
        positionKey,
      })
      const result = yield* admitBeforeAuthorityMutation(
        fixture,
        effect.proposal.proposalId,
        fixture.stores.authority.appendServerConfirmedEffectPlacement(
          reassignment,
        ),
      )

      expect(result.admissionOutcome._tag).toBe('Accepted')
      expect(result.mutationOutcome).toMatchObject({
        disposition: 'Appended',
      })
    }),
  )

  it.effect('serializes EffectResult admission before cancellation', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const increment = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      const causal = yield* fixture.authority.admit(
        increment.proposal.proposalId,
      )
      expect(causal._tag).toBe('Accepted')
      if (causal._tag !== 'Accepted') {
        return
      }
      const effect = yield* appendEffectResultProposal(
        fixture,
        causal.occurrence,
      )
      const positionKey = makeInstantV3EffectPlacementPositionKey(
        scope.sessionId,
        effect.request.requestId,
        1,
        1,
      )
      const cancellation = InstantV3EffectPlacementRecord.make({
        ...effect.appendedPlacement,
        cancellationGeneration: 1,
        decidedAtMs: effect.appendedPlacement.decidedAtMs + 1,
        id: nextUuid(810),
        placementId: positionKey,
        positionKey,
      })
      const result = yield* admitBeforeAuthorityMutation(
        fixture,
        effect.proposal.proposalId,
        fixture.stores.authority.appendServerConfirmedEffectPlacement(
          cancellation,
        ),
      )

      expect(result.admissionOutcome._tag).toBe('Accepted')
      expect(result.mutationOutcome).toMatchObject({
        disposition: 'Appended',
      })
    }),
  )

  it.effect('stops admission when the latest Program session is revoked', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture()
      const submission = yield* fixture.processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      yield* fixture.stores.authority.appendServerConfirmedProgramSession(
        InstantV3ProgramSessionRecord.make({
          ...fixture.session,
          createdAtMs: fixture.session.createdAtMs + 1,
          id: nextUuid(803),
          lifecycleGeneration: 2,
          lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
            scope.sessionId,
            2,
          ),
          lifecycleState: 'Revoked',
          previousLifecyclePositionKey: fixture.session.lifecyclePositionKey,
        }),
      )
      const outcome = yield* fixture.authority.admit(
        submission.proposal.proposalId,
      )
      expect(outcome._tag).toBe('Rejected')
      if (outcome._tag !== 'Rejected') {
        return
      }
      expect(outcome.resolution.rejectionReason).toBe('ScopeMismatch')
    }),
  )
})
