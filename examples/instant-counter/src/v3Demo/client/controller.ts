import {
  InteractionInvocation,
  type Model,
  MultipleCountersProgram,
  NavigationCarrierInvocation,
  activatedInteraction,
} from 'counters-core-example'
import { Data, Effect, Option, Scope, Stream } from 'effect'
import * as InteractionGraph from 'foldkit/interaction-graph'
import * as Synchronization from 'foldkit/synchronization'

import {
  SubjectScopedProgramInactive,
  type SubjectScopedProgramLifecycle,
  type SubjectScopedProgramSnapshot,
  SubjectScopedProgramSuperseded,
  type V3PendingProgramClaim,
  type V3SharedProgramActiveSession,
  type V3SharedProgramConnection,
  V3SharedProgramPersistenceError,
  type V3SharedProgramProcessorError,
  type V3SharedProgramProcessorSnapshot,
  type V3SharedProgramSubmission,
  type V3SharedProgramSubmissionError,
  type V3TerminalProgramClaim,
  makeSubjectScopedProgram,
} from '@foldkit/instant'

import {
  type MultipleCountersV3PolicyRequestRecord,
  type MultipleCountersV3PolicyResolutionRecord,
  makeMultipleCountersV3PolicyRequest,
} from '../shared/policyRequest.js'
import {
  type MultipleCountersV3Processor,
  type MultipleCountersV3ProcessorConfig,
  makeMultipleCountersV3Processor,
} from './processor.js'

/** Credential-free Processor error information safe for Client presentation. */
export type MultipleCountersV3ClientProcessorError = Readonly<{
  _tag: V3SharedProgramProcessorError['_tag']
}>

/** Credential-free Processor state safe for renderer and host adapters. */
export type MultipleCountersV3ClientProcessorSnapshot = Readonly<{
  acceptedModel: Model
  activeProgramSession: Option.Option<V3SharedProgramActiveSession>
  activeSessionPolicy: V3SharedProgramProcessorSnapshot<Model>['activeSessionPolicy']
  connection: V3SharedProgramConnection
  lastError: Option.Option<MultipleCountersV3ClientProcessorError>
  optimisticModel: Model
  pendingClaims: ReadonlyArray<V3PendingProgramClaim>
  recentTerminalClaims: ReadonlyArray<V3TerminalProgramClaim>
  throughAcceptedSequence: number
  waitingForAcceptedSequence: Option.Option<number>
}>

/** Public state for one authenticated Multiple Counters Client. */
export type MultipleCountersV3ClientSnapshot = Readonly<{
  lifecycle: SubjectScopedProgramLifecycle
  model: Model
  maybeActiveProgram: Option.Option<
    Readonly<{
      generation: number
      processorId: string
      processorSnapshot: MultipleCountersV3ClientProcessorSnapshot
      subjectId: string
    }>
  >
}>

/** No authenticated subject currently owns a running Processor. */
export class MultipleCountersV3InactiveClientError extends Data.TaggedError(
  'MultipleCountersV3InactiveClientError',
)<
  Readonly<{
    operation:
      | 'Connect'
      | 'Disconnect'
      | 'Open'
      | 'Perform'
      | 'RequestMode'
      | 'Retry'
  }>
> {}

/** No authority-confirmed active session exists for a policy request. */
export class MultipleCountersV3ClientPolicyUnavailable extends Data.TaggedError(
  'MultipleCountersV3ClientPolicyUnavailable',
)<Readonly<{ reason: 'NoActiveSession' }>> {}

/** A host boundary failed while constructing or persisting a policy request. */
export class MultipleCountersV3ClientPolicyRequestError extends Data.TaggedError(
  'MultipleCountersV3ClientPolicyRequestError',
)<Readonly<{ cause: unknown; stage: 'Construct' | 'Persist' | 'Resolve' }>> {}

/** Every typed failure from a controller Message submission. */
export type MultipleCountersV3ClientSubmissionError =
  | MultipleCountersV3InactiveClientError
  | V3SharedProgramSubmissionError

/** Stable persistence and optimistic-projection evidence for one submission. */
export type MultipleCountersV3ClientSubmission = V3SharedProgramSubmission

/** Returns whether the submitted proposal affects its stable optimistic projection. */
export const isMultipleCountersV3ClientSubmissionApplied = (
  clientSubmission: Pick<V3SharedProgramSubmission, 'projection'>,
): boolean =>
  clientSubmission.projection._tag === 'Applied' ||
  clientSubmission.projection._tag === 'Accepted'

/** Returns whether a failed persistence attempt retained a local optimistic proposal. */
export const isMultipleCountersV3RetainedOptimisticError = (
  error: MultipleCountersV3ClientSubmissionError,
): error is V3SharedProgramPersistenceError =>
  error instanceof V3SharedProgramPersistenceError

/** Host-owned dependencies that vary between browser, Expo, and Node Clients. */
export type MultipleCountersV3ClientControllerConfig = Readonly<{
  policyRequests: Readonly<{
    append: (
      request: MultipleCountersV3PolicyRequestRecord,
    ) => Effect.Effect<void, unknown>
    nextPolicyRequestId: () => string
    now: () => number
    resolve: (
      request: MultipleCountersV3PolicyRequestRecord,
    ) => Effect.Effect<MultipleCountersV3PolicyResolutionRecord, unknown>
  }>
  processorConfig: (
    subjectId: string,
  ) => Effect.Effect<MultipleCountersV3ProcessorConfig, unknown>
  signOut: () => Effect.Effect<void, unknown>
}>

/** Renderer-neutral controller for authentication, optimism, and Program claims. */
export type MultipleCountersV3ClientController = Readonly<{
  connect: Effect.Effect<void, MultipleCountersV3InactiveClientError>
  disconnect: Effect.Effect<void, MultipleCountersV3InactiveClientError>
  modelSource: Readonly<{
    readModel: () => Model
    subscribe: (listener: (model: Model) => void) => () => void
  }>
  open: (
    destinationUri: string,
  ) => Effect.Effect<
    MultipleCountersV3ClientSubmission,
    MultipleCountersV3ClientSubmissionError
  >
  perform: (
    reference: InteractionGraph.InteractionReference,
  ) => Effect.Effect<
    MultipleCountersV3ClientSubmission,
    MultipleCountersV3ClientSubmissionError
  >
  readSnapshot: Effect.Effect<MultipleCountersV3ClientSnapshot>
  reconcileAuthenticatedSubject: (
    maybeSubjectId: Option.Option<string>,
  ) => Effect.Effect<void, unknown>
  requestMode: (
    mode: Synchronization.Mode,
  ) => Effect.Effect<
    MultipleCountersV3PolicyResolutionRecord,
    | MultipleCountersV3ClientPolicyRequestError
    | MultipleCountersV3ClientPolicyUnavailable
    | MultipleCountersV3InactiveClientError
  >
  retry: (
    proposalId: string,
  ) => Effect.Effect<
    MultipleCountersV3ClientSubmission,
    MultipleCountersV3ClientSubmissionError
  >
  signOut: Effect.Effect<void, unknown>
  refreshAuthenticatedSubject: Effect.Effect<void, unknown>
  snapshots: Stream.Stream<MultipleCountersV3ClientSnapshot>
}>

const [initialModel] = MultipleCountersProgram.init()

const modelForSubjectProgramSnapshot = (
  snapshot: SubjectScopedProgramSnapshot<
    MultipleCountersV3Processor,
    V3SharedProgramProcessorSnapshot<Model>
  >,
): Model => {
  if (Option.isNone(snapshot.maybeActiveProgram)) {
    return initialModel
  }
  const maybeProgramSnapshot =
    snapshot.maybeActiveProgram.value.maybeProgramSnapshot
  return Option.isSome(maybeProgramSnapshot)
    ? maybeProgramSnapshot.value.optimisticModel
    : initialModel
}

const projectMultipleCountersV3ProcessorSnapshot = (
  snapshot: V3SharedProgramProcessorSnapshot<Model>,
): MultipleCountersV3ClientProcessorSnapshot => ({
  acceptedModel: snapshot.acceptedModel,
  activeProgramSession: snapshot.activeProgramSession,
  activeSessionPolicy: snapshot.activeSessionPolicy,
  connection: snapshot.connection,
  lastError: Option.map(snapshot.lastError, error => ({ _tag: error._tag })),
  optimisticModel: snapshot.optimisticModel,
  pendingClaims: snapshot.pendingClaims,
  recentTerminalClaims: snapshot.recentTerminalClaims,
  throughAcceptedSequence: snapshot.throughAcceptedSequence,
  waitingForAcceptedSequence: snapshot.waitingForAcceptedSequence,
})

/** Removes live Processor mutation and signing capabilities from a public snapshot. */
export const projectMultipleCountersV3ClientSnapshot = (
  subjectProgram: SubjectScopedProgramSnapshot<
    MultipleCountersV3Processor,
    V3SharedProgramProcessorSnapshot<Model>
  >,
): MultipleCountersV3ClientSnapshot => {
  const maybeActiveProgram = Option.flatMap(
    subjectProgram.maybeActiveProgram,
    active =>
      Option.map(active.maybeProgramSnapshot, processorSnapshot => ({
        generation: active.generation,
        processorId: active.program.identity.processorId,
        processorSnapshot:
          projectMultipleCountersV3ProcessorSnapshot(processorSnapshot),
        subjectId: active.subjectId,
      })),
  )
  return {
    lifecycle: subjectProgram.lifecycle,
    maybeActiveProgram,
    model: modelForSubjectProgramSnapshot(subjectProgram),
  }
}

/** Creates a scoped controller whose subject replacement closes the prior Processor first. */
export const makeMultipleCountersV3ClientController = (
  config: MultipleCountersV3ClientControllerConfig,
): Effect.Effect<MultipleCountersV3ClientController, never, Scope.Scope> =>
  Effect.gen(function* () {
    const subjectProgram = yield* makeSubjectScopedProgram<
      MultipleCountersV3Processor,
      V3SharedProgramProcessorSnapshot<Model>,
      unknown,
      never,
      unknown
    >({
      allocateProgram: context =>
        Effect.gen(function* () {
          const processorConfig = yield* config.processorConfig(
            context.subjectId,
          )
          const allocation =
            yield* makeMultipleCountersV3Processor(processorConfig)
          const initialSnapshot = yield* allocation.processor.readSnapshot
          yield* context.publishProgramSnapshot(initialSnapshot)
          const scope = yield* Effect.scope
          yield* Effect.forkIn(
            Stream.runForEach(allocation.processor.snapshots, snapshot =>
              context.publishProgramSnapshot(snapshot),
            ),
            scope,
          )
          yield* allocation.processor.connect
          return allocation
        }),
      signOut: config.signOut,
    })
    const listeners = new Set<(model: Model) => void>()
    let currentSubjectProgram = yield* subjectProgram.read
    const publishSubjectProgram = (
      snapshot: SubjectScopedProgramSnapshot<
        MultipleCountersV3Processor,
        V3SharedProgramProcessorSnapshot<Model>
      >,
    ): void => {
      currentSubjectProgram = snapshot
      const model = modelForSubjectProgramSnapshot(snapshot)
      listeners.forEach(listener => listener(model))
    }
    const ownerScope = yield* Effect.scope
    yield* Effect.forkIn(
      Stream.runForEach(subjectProgram.snapshots, snapshot =>
        Effect.sync(() => publishSubjectProgram(snapshot)),
      ),
      ownerScope,
    )

    const withActiveProcessor = <Value, Error>(
      operation: MultipleCountersV3InactiveClientError['operation'],
      use: (active: MultipleCountersV3Processor) => Effect.Effect<Value, Error>,
    ): Effect.Effect<Value, Error | MultipleCountersV3InactiveClientError> =>
      subjectProgram
        .withActiveProgram(active => use(active.program))
        .pipe(
          Effect.catchIf(
            error =>
              error instanceof SubjectScopedProgramInactive ||
              error instanceof SubjectScopedProgramSuperseded,
            () =>
              Effect.fail(
                new MultipleCountersV3InactiveClientError({ operation }),
              ),
          ),
        )

    const connect = withActiveProcessor(
      'Connect',
      active => active.processor.connect,
    )
    const disconnect = withActiveProcessor(
      'Disconnect',
      active => active.processor.disconnect,
    )
    const open = (destinationUri: string) =>
      withActiveProcessor('Open', active =>
        active.processor.submitAction(occurrenceId =>
          NavigationCarrierInvocation.make({
            destinationUri,
            occurrenceId,
          }),
        ),
      )
    const perform = (reference: InteractionGraph.InteractionReference) =>
      withActiveProcessor('Perform', active =>
        active.processor.submitAction(occurrenceId =>
          InteractionInvocation.make({
            occurrence: activatedInteraction(reference, occurrenceId),
          }),
        ),
      )
    const retry = (proposalId: string) =>
      withActiveProcessor('Retry', active =>
        active.processor.retryPending(proposalId),
      )
    const requestMode = (mode: Synchronization.Mode) =>
      withActiveProcessor('RequestMode', active =>
        Effect.gen(function* () {
          const snapshot = yield* active.processor.readSnapshot
          if (Option.isNone(snapshot.activeProgramSession)) {
            return yield* new MultipleCountersV3ClientPolicyUnavailable({
              reason: 'NoActiveSession',
            })
          }
          const activeProgramSession = snapshot.activeProgramSession.value
          const request = yield* Effect.try({
            try: () =>
              makeMultipleCountersV3PolicyRequest(
                active.scope,
                activeProgramSession,
                mode,
                {
                  policyRequestId: config.policyRequests.nextPolicyRequestId(),
                  requestedAtMs: config.policyRequests.now(),
                },
              ),
            catch: cause =>
              new MultipleCountersV3ClientPolicyRequestError({
                cause,
                stage: 'Construct',
              }),
          })
          yield* config.policyRequests.append(request).pipe(
            Effect.mapError(
              cause =>
                new MultipleCountersV3ClientPolicyRequestError({
                  cause,
                  stage: 'Persist',
                }),
            ),
          )
          return yield* config.policyRequests.resolve(request).pipe(
            Effect.mapError(
              cause =>
                new MultipleCountersV3ClientPolicyRequestError({
                  cause,
                  stage: 'Resolve',
                }),
            ),
          )
        }),
      )
    const snapshots = Stream.map(
      subjectProgram.snapshots,
      projectMultipleCountersV3ClientSnapshot,
    )

    return {
      connect,
      disconnect,
      modelSource: {
        readModel: () => modelForSubjectProgramSnapshot(currentSubjectProgram),
        subscribe: listener => {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
      },
      open,
      perform,
      readSnapshot: Effect.map(
        subjectProgram.read,
        projectMultipleCountersV3ClientSnapshot,
      ),
      reconcileAuthenticatedSubject:
        subjectProgram.reconcileAuthenticatedSubject,
      refreshAuthenticatedSubject: subjectProgram.refreshAuthenticatedSubject,
      requestMode,
      retry,
      signOut: subjectProgram.signOut,
      snapshots,
    }
  })
