import { Array as Array_, Option, Schema as S } from 'effect'
import {
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
  type Message,
  type Model,
} from 'instant-counter-example/domain'

import type { SharedProgramProcessorSnapshot } from '@foldkit/instant'

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
  detach: () => Promise<void>
  generation: number
  lease: CounterProcessorLease
  subjectId: string
}>

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
): string | null =>
  authentication._tag === 'SignedInAuthentication'
    ? authentication.subjectId
    : null

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

const runCleanupStep = async (step: () => Promise<void>): Promise<boolean> => {
  try {
    await step()
    return true
  } catch {
    return false
  }
}

/** Owns authenticated Processor replacement, proposals, and native teardown. */
export class NativeCounterController {
  readonly #authentication: NativeAuthenticationClient
  readonly #listeners = new Set<() => void>()
  readonly #processorGateway: CounterProcessorGateway
  #activeProcessor: ActiveProcessor | null = null
  #generation = 0
  #startupAbortController: AbortController | null = null
  #transition: Promise<void> = Promise.resolve()
  #viewState = initialViewState()

  constructor({
    authentication,
    processorGateway,
  }: NativeCounterControllerDependencies) {
    this.#authentication = authentication
    this.#processorGateway = processorGateway
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
    return this.#transition
  }

  /** Reconciles one token-redacted authentication observation. */
  authenticationChanged(authentication: Authentication): void {
    const previousSubject = subjectForAuthentication(
      this.#viewState.authentication,
    )
    const nextSubject = subjectForAuthentication(authentication)
    this.#setViewState({ ...this.#viewState, authentication })
    if (previousSubject === nextSubject) {
      return
    }

    this.#generation += 1
    const generation = this.#generation
    this.#fenceActions()
    this.#startupAbortController?.abort()
    this.#startupAbortController = null
    this.#clearCounterPresentation()

    if (nextSubject === null) {
      this.#setViewState({
        ...this.#viewState,
        processorLifecycle: IdleProcessor.make({}),
      })
      void this.#enqueue(() => this.#replaceProcessor(null, generation, null))
    } else {
      const abortController = new AbortController()
      this.#startupAbortController = abortController
      this.#setViewState({
        ...this.#viewState,
        maybeNotice: Option.some('Restoring the accepted counter tape.'),
        processorLifecycle: StartingProcessor.make({
          subjectId: nextSubject,
        }),
      })
      void this.#enqueue(() =>
        this.#replaceProcessor(nextSubject, generation, abortController),
      )
    }
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
    const activeProcessor = this.#activeProcessor
    if (activeProcessor === null || !this.#viewState.isActionFenceOpen) {
      this.#setNotice('No connected Processor is ready to disconnect.')
      return Promise.resolve()
    }
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
      if (
        this.#activeProcessor !== activeProcessor ||
        activeProcessor.generation !== this.#generation
      ) {
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
    const activeProcessor = this.#activeProcessor
    if (
      activeProcessor === null ||
      this.#viewState.processorLifecycle._tag !== 'DisconnectedProcessor'
    ) {
      this.#setNotice('No disconnected Processor is ready to reconnect.')
      return Promise.resolve()
    }
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
      if (
        this.#activeProcessor !== activeProcessor ||
        activeProcessor.generation !== this.#generation
      ) {
        return
      }
      const isReconnectSuccessful =
        isInitialPublishSuccessful &&
        isDisconnectSuccessful &&
        isConnectSuccessful &&
        isFinalPublishSuccessful
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
    const subjectId = subjectForAuthentication(authentication)
    if (subjectId === null) {
      return Promise.resolve()
    }
    this.#generation += 1
    this.#fenceActions()
    this.#startupAbortController?.abort()
    this.#startupAbortController = null
    this.#setViewState({
      ...this.#viewState,
      authentication: SigningOutAuthentication.make({}),
      maybeNotice: Option.some('Signing out and closing this Processor.'),
      processorLifecycle: StoppingProcessor.make({ subjectId }),
    })
    return this.#enqueue(async () => {
      const isReleaseClean = await this.#releaseActiveProcessor()
      try {
        await this.#authentication.signOut()
        this.#clearCounterPresentation()
        this.#setViewState({
          ...this.#viewState,
          maybeNotice: isReleaseClean
            ? Option.none()
            : Option.some(
                'Signed out after one local Processor cleanup step failed.',
              ),
          processorLifecycle: IdleProcessor.make({}),
        })
      } catch {
        this.#setViewState({
          ...this.#viewState,
          maybeNotice: Option.some('Instant could not complete sign out.'),
          processorLifecycle: IdleProcessor.make({}),
        })
        this.authenticationChanged(authentication)
      }
    })
  }

  /** Fences actions and releases native resources without signing out. */
  dispose(): Promise<void> {
    this.#generation += 1
    this.#fenceActions()
    this.#startupAbortController?.abort()
    this.#startupAbortController = null
    return this.#enqueue(async () => {
      await this.#releaseActiveProcessor()
    })
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const queued = this.#transition.then(operation, operation)
    this.#transition = queued.catch(() => undefined)
    return queued
  }

  async #replaceProcessor(
    subjectId: string | null,
    generation: number,
    abortController: AbortController | null,
  ): Promise<void> {
    await this.#releaseActiveProcessor()
    if (
      subjectId === null ||
      generation !== this.#generation ||
      abortController === null ||
      abortController.signal.aborted
    ) {
      return
    }

    try {
      const lease = await this.#processorGateway.allocate(
        subjectId,
        abortController.signal,
      )
      if (generation !== this.#generation || abortController.signal.aborted) {
        await this.#releaseLease(lease, () => Promise.resolve())
        return
      }
      const detach = lease.observe(snapshot => {
        if (
          generation === this.#generation &&
          subjectForAuthentication(this.#viewState.authentication) === subjectId
        ) {
          this.#setViewState(withProcessorSnapshot(this.#viewState, snapshot))
        }
      })
      const activeProcessor: ActiveProcessor = {
        detach,
        generation,
        lease,
        subjectId,
      }
      this.#activeProcessor = activeProcessor
      const snapshot = await lease.readSnapshot()
      if (
        this.#activeProcessor === activeProcessor &&
        activeProcessor.generation === this.#generation
      ) {
        this.#setViewState(withProcessorSnapshot(this.#viewState, snapshot))
      }
      await lease.connect()
      await lease.publishUnavailable()
      if (
        this.#activeProcessor !== activeProcessor ||
        generation !== this.#generation ||
        abortController.signal.aborted
      ) {
        if (this.#activeProcessor === activeProcessor) {
          this.#activeProcessor = null
        }
        await this.#releaseLease(lease, detach)
        return
      }
      this.#startupAbortController = null
      this.#setViewState({
        ...this.#viewState,
        isActionFenceOpen: true,
        maybeNotice: Option.none(),
        processorLifecycle: ReadyProcessor.make({ subjectId }),
      })
    } catch {
      if (generation === this.#generation && !abortController.signal.aborted) {
        await this.#releaseActiveProcessor()
        this.#setViewState({
          ...this.#viewState,
          maybeNotice: Option.some(
            'The Processor could not start. Confirm the shared schema, permissions, and authority.',
          ),
          processorLifecycle: FailedProcessor.make({
            reason: 'Processor startup failed.',
            subjectId,
          }),
        })
      }
    }
  }

  async #propose(message: Message): Promise<void> {
    const activeProcessor = this.#activeProcessor
    if (activeProcessor === null || !this.#viewState.isActionFenceOpen) {
      this.#setNotice('No connected Processor is ready for counter actions.')
      return
    }
    try {
      await activeProcessor.lease.propose(message)
    } catch {
      if (
        this.#activeProcessor === activeProcessor &&
        activeProcessor.generation === this.#generation
      ) {
        this.#setNotice(
          'The counter proposal could not be written. The accepted count is unchanged.',
        )
      }
    }
  }

  async #releaseActiveProcessor(): Promise<boolean> {
    const activeProcessor = this.#activeProcessor
    this.#activeProcessor = null
    if (activeProcessor === null) {
      return true
    }
    return this.#releaseLease(activeProcessor.lease, activeProcessor.detach)
  }

  async #releaseLease(
    lease: CounterProcessorLease,
    detach: () => Promise<void>,
  ): Promise<boolean> {
    const isPublishSuccessful = await runCleanupStep(lease.publishUnavailable)
    const isDisconnectSuccessful = await runCleanupStep(lease.disconnect)
    const isDetachSuccessful = await runCleanupStep(detach)
    const isReleaseSuccessful = await runCleanupStep(lease.release)
    return (
      isPublishSuccessful &&
      isDisconnectSuccessful &&
      isDetachSuccessful &&
      isReleaseSuccessful
    )
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
    this.#setViewState({
      ...this.#viewState,
      acceptedSequence: 0,
      count: 0,
      displayedSequence: 0,
      pendingCount: 0,
      processorConnection: 'Detached',
    })
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
