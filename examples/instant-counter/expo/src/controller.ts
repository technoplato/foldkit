import {
  Array as Array_,
  Data,
  Effect,
  Exit,
  Match as M,
  Option,
  Schema as S,
  Scope,
  Stream,
} from 'effect'
import {
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
  type Message,
  type Model,
} from 'instant-counter-example/domain'

import {
  type SharedProgramProcessorSnapshot,
  type SubjectScopedProgram,
  type SubjectScopedProgramAllocationContext,
  type SubjectScopedProgramSnapshot,
  makeSubjectScopedProgram,
} from '@foldkit/instant'

/** Instant is restoring persisted authentication. */
export const RestoringAuthentication = S.TaggedStruct(
  'RestoringAuthentication',
  {},
)

/** No authenticated subject is available. */
export const SignedOutAuthentication = S.TaggedStruct(
  'SignedOutAuthentication',
  {},
)

/** One authenticated subject is available without exposing credentials. */
export const SignedInAuthentication = S.TaggedStruct('SignedInAuthentication', {
  maybeEmail: S.OptionFromNullOr(S.String),
  subjectId: S.String,
})

/** Restoring or observing native authentication failed. */
export const FailedAuthentication = S.TaggedStruct('FailedAuthentication', {
  reason: S.String,
})

/** The controller has fenced actions and is releasing the signed-in subject. */
export const SigningOutAuthentication = S.TaggedStruct(
  'SigningOutAuthentication',
  {},
)

/** Every credential-free authentication state rendered by the native host. */
export const Authentication = S.Union([
  RestoringAuthentication,
  SignedOutAuthentication,
  SignedInAuthentication,
  FailedAuthentication,
  SigningOutAuthentication,
])

/** Every credential-free authentication state rendered by the native host. */
export type Authentication = typeof Authentication.Type

const IdleProcessor = S.TaggedStruct('IdleProcessor', {})
const StartingProcessor = S.TaggedStruct('StartingProcessor', {
  subjectId: S.String,
})
const ReadyProcessor = S.TaggedStruct('ReadyProcessor', {
  subjectId: S.String,
})
const DisconnectingProcessor = S.TaggedStruct('DisconnectingProcessor', {
  subjectId: S.String,
})
const DisconnectedProcessor = S.TaggedStruct('DisconnectedProcessor', {
  subjectId: S.String,
})
const ReconnectingProcessor = S.TaggedStruct('ReconnectingProcessor', {
  subjectId: S.String,
})
const StoppingProcessor = S.TaggedStruct('StoppingProcessor', {
  subjectId: S.String,
})
const FailedProcessor = S.TaggedStruct('FailedProcessor', {
  reason: S.String,
  subjectId: S.String,
})

const ProcessorLifecycle = S.Union([
  IdleProcessor,
  StartingProcessor,
  ReadyProcessor,
  DisconnectingProcessor,
  DisconnectedProcessor,
  ReconnectingProcessor,
  StoppingProcessor,
  FailedProcessor,
])

/** Every explicit Processor lifecycle rendered by the native host. */
export type ProcessorLifecycle = typeof ProcessorLifecycle.Type

/** Every Instant transport status rendered by the native host. */
export type TransportStatus =
  | 'connecting'
  | 'opened'
  | 'authenticated'
  | 'closed'
  | 'errored'

/** One atomic shared Processor snapshot consumed by the controller. */
export type CounterProcessorSnapshot = SharedProgramProcessorSnapshot<Model>

/** One allocated Processor adapted to promise-based native lifecycle calls. */
export type CounterProcessorLease = Readonly<{
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  observe: (
    listener: (snapshot: CounterProcessorSnapshot) => void,
  ) => () => Promise<void>
  propose: (message: Message) => Promise<void>
  publishUnavailable: () => Promise<void>
  readSnapshot: () => Promise<CounterProcessorSnapshot>
  release: () => Promise<void>
}>

/** Allocates one cancellable authenticated Processor for the native Client. */
export type CounterProcessorGateway = Readonly<{
  allocate: (
    subjectId: string,
    signal: AbortSignal,
  ) => Promise<CounterProcessorLease>
}>

/** Email magic-code operations owned by the React Native Instant wrapper. */
export type NativeAuthenticationClient = Readonly<{
  sendMagicCode: (email: string) => Promise<void>
  signInWithMagicCode: (email: string, code: string) => Promise<void>
  signOut: () => Promise<void>
}>

/** Renderer-ready controller state with no credential or executable values. */
export type NativeCounterViewState = Readonly<{
  acceptedSequence: number
  authentication: Authentication
  count: number
  displayedSequence: number
  isActionFenceOpen: boolean
  maybeNotice: Option.Option<string>
  pendingCount: number
  processorConnection: string
  processorLifecycle: ProcessorLifecycle
  transportStatus: TransportStatus
}>

/** Dependencies required by one native counter controller. */
export type NativeCounterControllerDependencies = Readonly<{
  authentication: NativeAuthenticationClient
  processorGateway: CounterProcessorGateway
}>

type ActiveProcessor = Readonly<{
  generation: number
  lease: CounterProcessorLease
  subjectId: string
}>

class NativeProcessorLifecycleError extends Data.TaggedError(
  'NativeProcessorLifecycleError',
)<{
  readonly cause: unknown
  readonly operation:
    | 'AllocateProcessor'
    | 'ConnectProcessor'
    | 'ObserveProcessor'
    | 'PublishAvailability'
    | 'ReadSnapshot'
    | 'SignOut'
}> {}

type NativeSubjectProgram = SubjectScopedProgram<
  CounterProcessorLease,
  CounterProcessorSnapshot,
  NativeProcessorLifecycleError,
  never,
  NativeProcessorLifecycleError
>

const initialViewState = (): NativeCounterViewState => ({
  acceptedSequence: 0,
  authentication: RestoringAuthentication.make({}),
  count: 0,
  displayedSequence: 0,
  isActionFenceOpen: false,
  maybeNotice: Option.none(),
  pendingCount: 0,
  processorConnection: 'Detached',
  processorLifecycle: IdleProcessor.make({}),
  transportStatus: 'connecting',
})

const subjectForAuthentication = (
  authentication: Authentication,
): Option.Option<string> =>
  M.value(authentication).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      FailedAuthentication: () => Option.none(),
      RestoringAuthentication: () => Option.none(),
      SignedInAuthentication: signedIn => Option.some(signedIn.subjectId),
      SignedOutAuthentication: () => Option.none(),
      SigningOutAuthentication: () => Option.none(),
    }),
  )

const processorConnectionLabel = (
  snapshot: CounterProcessorSnapshot,
): string => {
  if (snapshot.connection._tag === 'Detached') {
    return 'Detached'
  } else {
    return `Attached · ${snapshot.connection.transportStatus}`
  }
}

const displayedSequence = (snapshot: CounterProcessorSnapshot): number =>
  snapshot.replayMode._tag === 'Inspecting'
    ? snapshot.replayMode.frame
    : snapshot.acceptedSequence

const withProcessorSnapshot = (
  state: NativeCounterViewState,
  snapshot: CounterProcessorSnapshot,
): NativeCounterViewState => ({
  ...state,
  acceptedSequence: snapshot.acceptedSequence,
  count: snapshot.displayedModel.counter.count,
  displayedSequence: displayedSequence(snapshot),
  pendingCount: Array_.length(snapshot.pendingProposals),
  processorConnection: processorConnectionLabel(snapshot),
})

const withoutProcessorSnapshot = (
  state: NativeCounterViewState,
): NativeCounterViewState => ({
  ...state,
  acceptedSequence: 0,
  count: 0,
  displayedSequence: 0,
  pendingCount: 0,
  processorConnection: 'Detached',
})

const preservesExplicitConnectionLifecycle = (
  lifecycle: ProcessorLifecycle,
): boolean =>
  M.value(lifecycle).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      DisconnectedProcessor: () => true,
      DisconnectingProcessor: () => true,
      FailedProcessor: () => false,
      IdleProcessor: () => false,
      ReadyProcessor: () => false,
      ReconnectingProcessor: () => true,
      StartingProcessor: () => false,
      StoppingProcessor: () => true,
    }),
  )

const runCleanupStep = async (step: () => Promise<void>): Promise<boolean> => {
  try {
    await step()
    return true
  } catch {
    return false
  }
}

const cleanupStep = (step: () => Promise<void>): Effect.Effect<void> =>
  Effect.promise(() => runCleanupStep(step)).pipe(Effect.asVoid)

const backgroundStartupSchedulingDelayMilliseconds = 0

const allocateSubjectProcessor = (
  processorGateway: CounterProcessorGateway,
  context: SubjectScopedProgramAllocationContext<CounterProcessorSnapshot>,
  connectionStartupFailed: (generation: number, subjectId: string) => void,
  synchronizeSubjectProgram: () => void,
): Effect.Effect<
  CounterProcessorLease,
  NativeProcessorLifecycleError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const abortController = new AbortController()
    yield* Effect.addFinalizer(() => Effect.sync(() => abortController.abort()))
    const lease = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          processorGateway.allocate(context.subjectId, abortController.signal),
        catch: cause =>
          new NativeProcessorLifecycleError({
            cause,
            operation: 'AllocateProcessor',
          }),
      }),
      lease => cleanupStep(lease.release),
    )
    if (abortController.signal.aborted) {
      return yield* Effect.fail(
        new NativeProcessorLifecycleError({
          cause: 'The authenticated subject changed during allocation.',
          operation: 'AllocateProcessor',
        }),
      )
    }
    const detach = yield* Effect.try({
      try: () =>
        lease.observe(snapshot => {
          Effect.runSync(context.publishProgramSnapshot(snapshot))
          synchronizeSubjectProgram()
        }),
      catch: cause =>
        new NativeProcessorLifecycleError({
          cause,
          operation: 'ObserveProcessor',
        }),
    })
    yield* Effect.addFinalizer(() => cleanupStep(detach))
    yield* Effect.addFinalizer(() => cleanupStep(lease.disconnect))
    yield* Effect.addFinalizer(() => cleanupStep(lease.publishUnavailable))
    const initialSnapshot = yield* Effect.tryPromise({
      try: lease.readSnapshot,
      catch: cause =>
        new NativeProcessorLifecycleError({
          cause,
          operation: 'ReadSnapshot',
        }),
    })
    yield* context.publishProgramSnapshot(initialSnapshot)
    synchronizeSubjectProgram()
    const subjectScope = yield* Effect.scope
    yield* Effect.forkIn(
      Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: lease.connect,
          catch: cause =>
            new NativeProcessorLifecycleError({
              cause,
              operation: 'ConnectProcessor',
            }),
        })
        yield* Effect.tryPromise({
          try: lease.publishUnavailable,
          catch: cause =>
            new NativeProcessorLifecycleError({
              cause,
              operation: 'PublishAvailability',
            }),
        })
      }).pipe(
        Effect.catch(() =>
          Effect.sync(() =>
            connectionStartupFailed(context.generation, context.subjectId),
          ),
        ),
      ),
      subjectScope,
    )
    yield* Effect.sleep(backgroundStartupSchedulingDelayMilliseconds)
    return lease
  })

/** Owns authenticated Processor replacement, proposals, and native teardown. */
export class NativeCounterController {
  readonly #authentication: NativeAuthenticationClient
  readonly #listeners = new Set<() => void>()
  readonly #processorGateway: CounterProcessorGateway
  readonly #scope: Scope.Closeable
  readonly #subjectProgram: NativeSubjectProgram
  #maybeConnectionStartupFailureGeneration = Option.none<number>()
  #subjectTransition: Promise<void> = Promise.resolve()
  #transition: Promise<void> = Promise.resolve()
  #viewState = initialViewState()

  constructor({
    authentication,
    processorGateway,
  }: NativeCounterControllerDependencies) {
    this.#authentication = authentication
    this.#processorGateway = processorGateway
    this.#scope = Scope.makeUnsafe()
    this.#subjectProgram = Effect.runSync(
      makeSubjectScopedProgram<
        CounterProcessorLease,
        CounterProcessorSnapshot,
        NativeProcessorLifecycleError,
        never,
        NativeProcessorLifecycleError
      >({
        allocateProgram: context =>
          allocateSubjectProcessor(
            this.#processorGateway,
            context,
            (generation, subjectId) =>
              this.#connectionStartupFailed(generation, subjectId),
            () => this.#synchronizeSubjectProgram(),
          ),
        signOut: () =>
          Effect.tryPromise({
            try: this.#authentication.signOut,
            catch: cause =>
              new NativeProcessorLifecycleError({
                cause,
                operation: 'SignOut',
              }),
          }),
      }).pipe(Scope.provide(this.#scope)),
    )
    Effect.runSync(
      Effect.forkIn(
        Stream.runForEach(this.#subjectProgram.snapshots, snapshot =>
          Effect.sync(() => this.#subjectProgramChanged(snapshot)),
        ),
        this.#scope,
      ),
    )
  }

  /** Returns the current atomic view state for useSyncExternalStore. */
  readonly getSnapshot = (): NativeCounterViewState => this.#viewState

  /** Subscribes one renderer and returns its synchronous detach function. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** Waits until every currently queued lifecycle transition has settled. */
  settled(): Promise<void> {
    return Promise.all([this.#subjectTransition, this.#transition]).then(
      () => undefined,
    )
  }

  /** Reconciles one token-redacted authentication observation. */
  authenticationChanged(authentication: Authentication): void {
    const nextSubject = subjectForAuthentication(authentication)
    this.#setViewState({ ...this.#viewState, authentication })
    this.#synchronizeSubjectProgram()
    const transition = Effect.runPromise(
      this.#subjectProgram.reconcileAuthenticatedSubject(nextSubject),
    )
      .then(() => this.#synchronizeSubjectProgram())
      .catch(() => this.#synchronizeSubjectProgram())
    this.#synchronizeSubjectProgram()
    this.#trackSubjectTransition(transition)
  }

  /** Records the current native Instant transport status. */
  transportChanged(transportStatus: TransportStatus): void {
    this.#setViewState({ ...this.#viewState, transportStatus })
  }

  /** Proposes the canonical Counter increment Message. */
  increment(): Promise<void> {
    return this.#propose(ClickedIncrement())
  }

  /** Proposes the canonical Counter decrement Message. */
  decrement(): Promise<void> {
    return this.#propose(ClickedDecrement())
  }

  /** Proposes the canonical Counter reset Message. */
  reset(): Promise<void> {
    return this.#propose(ClickedReset())
  }

  /** Disconnects the active Processor while retaining its accepted Model. */
  disconnect(): Promise<void> {
    const maybeActiveProcessor = this.#readActiveProcessor()
    if (
      Option.isNone(maybeActiveProcessor) ||
      !this.#viewState.isActionFenceOpen
    ) {
      this.#setNotice('No connected Processor is ready to disconnect.')
      return Promise.resolve()
    }
    const activeProcessor = maybeActiveProcessor.value
    this.#maybeConnectionStartupFailureGeneration = Option.none()
    this.#fenceActions()
    this.#setViewState({
      ...this.#viewState,
      processorLifecycle: DisconnectingProcessor.make({
        subjectId: activeProcessor.subjectId,
      }),
    })
    return this.#enqueue(async () => {
      const isPublishSuccessful = await runCleanupStep(
        activeProcessor.lease.publishUnavailable,
      )
      const isDisconnectSuccessful = await runCleanupStep(
        activeProcessor.lease.disconnect,
      )
      if (!this.#isCurrentActiveProcessor(activeProcessor)) {
        return
      }
      if (isPublishSuccessful && isDisconnectSuccessful) {
        this.#setViewState({
          ...this.#viewState,
          maybeNotice: Option.none(),
          processorConnection: 'Detached',
          processorLifecycle: DisconnectedProcessor.make({
            subjectId: activeProcessor.subjectId,
          }),
        })
      } else {
        this.#setViewState({
          ...this.#viewState,
          isActionFenceOpen: true,
          maybeNotice: Option.some(
            'The Processor could not complete its disconnect.',
          ),
          processorLifecycle: ReadyProcessor.make({
            subjectId: activeProcessor.subjectId,
          }),
        })
      }
    })
  }

  /** Reconnects by publishing unavailable, disconnecting, and connecting anew. */
  reconnect(): Promise<void> {
    const maybeActiveProcessor = this.#readActiveProcessor()
    if (
      Option.isNone(maybeActiveProcessor) ||
      this.#viewState.processorLifecycle._tag !== 'DisconnectedProcessor'
    ) {
      this.#setNotice('No disconnected Processor is ready to reconnect.')
      return Promise.resolve()
    }
    const activeProcessor = maybeActiveProcessor.value
    this.#setViewState({
      ...this.#viewState,
      maybeNotice: Option.some('Reconnecting the accepted counter tape.'),
      processorLifecycle: ReconnectingProcessor.make({
        subjectId: activeProcessor.subjectId,
      }),
    })
    return this.#enqueue(async () => {
      const isInitialPublishSuccessful = await runCleanupStep(
        activeProcessor.lease.publishUnavailable,
      )
      const isDisconnectSuccessful = await runCleanupStep(
        activeProcessor.lease.disconnect,
      )
      const isConnectSuccessful = await runCleanupStep(
        activeProcessor.lease.connect,
      )
      const isFinalPublishSuccessful = await runCleanupStep(
        activeProcessor.lease.publishUnavailable,
      )
      if (!this.#isCurrentActiveProcessor(activeProcessor)) {
        return
      }
      const isReconnectSuccessful =
        isInitialPublishSuccessful &&
        isDisconnectSuccessful &&
        isConnectSuccessful &&
        isFinalPublishSuccessful
      if (isReconnectSuccessful) {
        this.#maybeConnectionStartupFailureGeneration = Option.none()
      }
      this.#setViewState({
        ...this.#viewState,
        isActionFenceOpen: isReconnectSuccessful,
        maybeNotice: isReconnectSuccessful
          ? Option.none()
          : Option.some(
              'Reconnect failed. The accepted counter remains visible.',
            ),
        processorLifecycle: isReconnectSuccessful
          ? ReadyProcessor.make({ subjectId: activeProcessor.subjectId })
          : DisconnectedProcessor.make({
              subjectId: activeProcessor.subjectId,
            }),
      })
    })
  }

  /** Sends an email magic code without retaining the address in controller state. */
  async sendMagicCode(email: string): Promise<boolean> {
    this.#setNotice('Sending a one-time code.')
    try {
      await this.#authentication.sendMagicCode(email)
      this.#setNotice('Check your email for the one-time code.')
      return true
    } catch {
      this.#setNotice(
        'Instant could not send that code. Check the address and try again.',
      )
      return false
    }
  }

  /** Verifies an email magic code without retaining it in controller state. */
  async signInWithMagicCode(email: string, code: string): Promise<boolean> {
    this.#setNotice('Verifying the one-time code.')
    try {
      await this.#authentication.signInWithMagicCode(email, code)
      this.#setNotice('The code was accepted. Starting your Processor.')
      return true
    } catch {
      this.#setNotice(
        'That code was not accepted. Request a new code and try again.',
      )
      return false
    }
  }

  /** Releases the Processor completely before invalidating Instant auth. */
  signOut(): Promise<void> {
    const authentication = this.#viewState.authentication
    const maybeSubjectId = subjectForAuthentication(authentication)
    if (Option.isNone(maybeSubjectId)) {
      return Promise.resolve()
    }
    this.#fenceActions()
    this.#setViewState({
      ...this.#viewState,
      authentication: SigningOutAuthentication.make({}),
      maybeNotice: Option.some('Signing out and closing this Processor.'),
      processorLifecycle: StoppingProcessor.make({
        subjectId: maybeSubjectId.value,
      }),
    })
    const transition = Effect.runPromise(this.#subjectProgram.signOut)
      .then(() => {
        this.#clearCounterPresentation()
        this.#setViewState({
          ...this.#viewState,
          maybeNotice: Option.none(),
          processorLifecycle: IdleProcessor.make({}),
        })
      })
      .catch(() => {
        this.#setViewState({
          ...this.#viewState,
          maybeNotice: Option.some('Instant could not complete sign out.'),
          processorLifecycle: IdleProcessor.make({}),
        })
        this.authenticationChanged(authentication)
      })
    this.#trackSubjectTransition(transition)
    return transition
  }

  /** Fences actions and releases native resources without signing out. */
  dispose(): Promise<void> {
    this.#fenceActions()
    this.#clearCounterPresentation()
    const transition = Effect.runPromise(Scope.close(this.#scope, Exit.void))
    this.#trackSubjectTransition(transition)
    return transition
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const queued = this.#transition.then(operation, operation)
    this.#transition = queued.catch(() => undefined)
    return queued
  }

  #trackSubjectTransition(transition: Promise<void>): void {
    const settledTransition = transition.catch(() => undefined)
    this.#subjectTransition = Promise.all([
      this.#subjectTransition,
      settledTransition,
    ]).then(() => undefined)
  }

  #readActiveProcessor(): Option.Option<ActiveProcessor> {
    const snapshot = Effect.runSync(this.#subjectProgram.read)
    return Option.map(snapshot.maybeActiveProgram, activeProgram => ({
      generation: activeProgram.generation,
      lease: activeProgram.program,
      subjectId: activeProgram.subjectId,
    }))
  }

  #isCurrentActiveProcessor(activeProcessor: ActiveProcessor): boolean {
    const maybeCurrentProcessor = this.#readActiveProcessor()
    return (
      Option.isSome(maybeCurrentProcessor) &&
      maybeCurrentProcessor.value.generation === activeProcessor.generation &&
      maybeCurrentProcessor.value.lease === activeProcessor.lease
    )
  }

  #synchronizeSubjectProgram(): void {
    this.#subjectProgramChanged(Effect.runSync(this.#subjectProgram.read))
  }

  #connectionStartupFailed(generation: number, subjectId: string): void {
    const snapshot = Effect.runSync(this.#subjectProgram.read)
    if (
      this.#viewState.authentication._tag !== 'SignedInAuthentication' ||
      this.#viewState.authentication.subjectId !== subjectId ||
      snapshot.lifecycle._tag === 'InactiveSubjectScopedProgram' ||
      snapshot.lifecycle.generation !== generation
    ) {
      return
    }
    this.#maybeConnectionStartupFailureGeneration = Option.some(generation)
    this.#subjectProgramChanged(snapshot)
  }

  #isAuthenticatedSubject(subjectId: string): boolean {
    return (
      this.#viewState.authentication._tag === 'SignedInAuthentication' &&
      this.#viewState.authentication.subjectId === subjectId
    )
  }

  #showAuthenticationTarget(): void {
    this.#maybeConnectionStartupFailureGeneration = Option.none()
    if (this.#viewState.authentication._tag === 'SignedInAuthentication') {
      this.#setViewState({
        ...withoutProcessorSnapshot(this.#viewState),
        isActionFenceOpen: false,
        maybeNotice: Option.some('Restoring the accepted counter tape.'),
        processorLifecycle: StartingProcessor.make({
          subjectId: this.#viewState.authentication.subjectId,
        }),
      })
    } else {
      const isSigningOut =
        this.#viewState.authentication._tag === 'SigningOutAuthentication'
      this.#setViewState({
        ...withoutProcessorSnapshot(this.#viewState),
        isActionFenceOpen: false,
        maybeNotice: isSigningOut ? this.#viewState.maybeNotice : Option.none(),
        processorLifecycle: isSigningOut
          ? this.#viewState.processorLifecycle
          : IdleProcessor.make({}),
      })
    }
  }

  #subjectProgramChanged(
    snapshot: SubjectScopedProgramSnapshot<
      CounterProcessorLease,
      CounterProcessorSnapshot
    >,
  ): void {
    M.value(snapshot.lifecycle).pipe(
      M.withReturnType<void>(),
      M.tagsExhaustive({
        ActiveSubjectScopedProgram: active => {
          if (!this.#isAuthenticatedSubject(active.subjectId)) {
            this.#showAuthenticationTarget()
            return
          }
          const maybeActiveProgram = snapshot.maybeActiveProgram
          if (Option.isNone(maybeActiveProgram)) {
            return
          }
          const nextViewState = Option.isSome(
            maybeActiveProgram.value.maybeProgramSnapshot,
          )
            ? withProcessorSnapshot(
                this.#viewState,
                maybeActiveProgram.value.maybeProgramSnapshot.value,
              )
            : this.#viewState
          if (
            preservesExplicitConnectionLifecycle(
              nextViewState.processorLifecycle,
            )
          ) {
            this.#setViewState(nextViewState)
          } else {
            const maybeNotice =
              Option.isSome(this.#maybeConnectionStartupFailureGeneration) &&
              this.#maybeConnectionStartupFailureGeneration.value ===
                active.generation
                ? Option.some(
                    'The cached accepted Model is available, but the Processor could not connect. Reconnect when transport is available.',
                  )
                : Option.none()
            this.#setViewState({
              ...nextViewState,
              isActionFenceOpen: true,
              maybeNotice,
              processorLifecycle: ReadyProcessor.make({
                subjectId: active.subjectId,
              }),
            })
          }
        },
        AllocatingSubjectScopedProgram: allocating => {
          if (!this.#isAuthenticatedSubject(allocating.subjectId)) {
            this.#showAuthenticationTarget()
            return
          }
          if (
            Option.isSome(this.#maybeConnectionStartupFailureGeneration) &&
            this.#maybeConnectionStartupFailureGeneration.value !==
              allocating.generation
          ) {
            this.#maybeConnectionStartupFailureGeneration = Option.none()
          }
          this.#setViewState({
            ...withoutProcessorSnapshot(this.#viewState),
            isActionFenceOpen: false,
            maybeNotice: Option.some('Restoring the accepted counter tape.'),
            processorLifecycle: StartingProcessor.make({
              subjectId: allocating.subjectId,
            }),
          })
        },
        FailedSubjectScopedProgram: failed => {
          if (!this.#isAuthenticatedSubject(failed.subjectId)) {
            this.#showAuthenticationTarget()
            return
          }
          this.#maybeConnectionStartupFailureGeneration = Option.none()
          this.#setViewState({
            ...withoutProcessorSnapshot(this.#viewState),
            isActionFenceOpen: false,
            maybeNotice: Option.some(
              'The Processor could not start. Confirm the shared schema and permissions, and that the admission sequencer is running.',
            ),
            processorLifecycle: FailedProcessor.make({
              reason: 'Processor startup failed.',
              subjectId: failed.subjectId,
            }),
          })
        },
        InactiveSubjectScopedProgram: () => {
          this.#showAuthenticationTarget()
        },
      }),
    )
  }

  async #propose(message: Message): Promise<void> {
    const maybeActiveProcessor = this.#readActiveProcessor()
    if (
      Option.isNone(maybeActiveProcessor) ||
      !this.#viewState.isActionFenceOpen
    ) {
      this.#setNotice('No connected Processor is ready for counter actions.')
      return
    }
    const activeProcessor = maybeActiveProcessor.value
    try {
      await activeProcessor.lease.propose(message)
    } catch {
      if (this.#isCurrentActiveProcessor(activeProcessor)) {
        this.#setNotice(
          'The counter proposal could not be written. The accepted count is unchanged.',
        )
      }
    }
  }

  #fenceActions(): void {
    if (this.#viewState.isActionFenceOpen) {
      this.#setViewState({
        ...this.#viewState,
        isActionFenceOpen: false,
      })
    }
  }

  #clearCounterPresentation(): void {
    this.#setViewState(withoutProcessorSnapshot(this.#viewState))
  }

  #setNotice(notice: string): void {
    this.#setViewState({
      ...this.#viewState,
      maybeNotice: Option.some(notice),
    })
  }

  #setViewState(viewState: NativeCounterViewState): void {
    this.#viewState = viewState
    this.#listeners.forEach(listener => listener())
  }
}
