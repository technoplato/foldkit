import { Effect, Exit, Option, Ref, Scope, Stream } from 'effect'
import { Processor } from 'foldkit'

import {
  type SharedProgramProcessorSnapshot,
  type SubjectScopedProgram,
  type SubjectScopedProgramActive,
  type SubjectScopedProgramAllocationContext,
  type SubjectScopedProgramSnapshot,
  makeSubjectScopedProgram,
} from '@foldkit/instant'
import type { ConnectionStatus } from '@instantdb/core'

import type { InstantCounterDatabase } from '../../instant.schema.js'
import {
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
  type EffectRequestKind,
  RequestedEffect,
} from '../domain/message.js'
import type { Model } from '../domain/model.js'
import { decodeProcessorPresence } from '../shared/presence.js'
import { randomId } from '../transport/session.js'
import {
  type Authentication,
  LoadingAuthentication,
  observeAuthentication,
  sendMagicCode,
  signInWithGoogle,
  signInWithMagicCode,
  signOut,
} from './auth.js'
import {
  loadClientIdentity,
  makeActorSequenceRegistry,
  makeAttemptedEffectRegistry,
} from './localState.js'
import {
  type BrowserProcessor,
  allocateBrowserProcessor,
  observeProcessorPresence,
  observeProcessorSnapshots,
} from './processor.js'
import { type BrowserViewActions, renderBrowserView } from './view.js'

type BrowserProgramSnapshot = Readonly<{
  presence: ReadonlyArray<Processor.Descriptor>
  shared: SharedProgramProcessorSnapshot<Model>
}>

type BrowserSubjectProgram = SubjectScopedProgram<
  BrowserProcessor,
  BrowserProgramSnapshot
>

type BrowserSubjectProgramSnapshot = SubjectScopedProgramSnapshot<
  BrowserProcessor,
  BrowserProgramSnapshot
>

/** Owns the token-redacted browser shell around one real Foldkit Processor. */
export class BrowserApp {
  readonly #actions: BrowserViewActions
  readonly #actorSequences = makeActorSequenceRegistry()
  readonly #attemptRegistry = makeAttemptedEffectRegistry()
  readonly #database: InstantCounterDatabase
  readonly #identity = loadClientIdentity()
  readonly #root: HTMLElement
  #authentication: Authentication = LoadingAuthentication.make({})
  #connectionStatus: ConnectionStatus = 'connecting'
  #maybeNotice = Option.none<string>()
  #maybeSentEmail = Option.none<string>()
  #subjectProgram: BrowserSubjectProgram | null = null
  #subjectProgramScope: Scope.Closeable | null = null
  #subjectProgramSnapshot: BrowserSubjectProgramSnapshot | null = null
  #unsubscribeAuthentication: (() => void) | null = null
  #unsubscribeConnection: (() => void) | null = null

  constructor(root: HTMLElement, database: InstantCounterDatabase) {
    this.#root = root
    this.#database = database
    this.#actions = {
      changeEmail: () => {
        this.#maybeSentEmail = Option.none()
        this.#render()
      },
      connect: () => this.#connect(),
      decrementCounter: () => this.#propose(ClickedDecrement()),
      disconnect: () => this.#disconnect(),
      incrementCounter: () => this.#propose(ClickedIncrement()),
      inspectReplay: frame => this.#inspectReplay(frame),
      proposeEffect: kind => this.#proposeEffect(kind),
      resetCounter: () => this.#propose(ClickedReset()),
      returnLive: () => this.#returnLive(),
      sendMagicCode: email => this.#sendMagicCode(email),
      signInWithGoogle: () => signInWithGoogle(this.#database),
      signInWithMagicCode: (email, code) =>
        this.#signInWithMagicCode(email, code),
      signOut: () => this.#signOut(),
    }
  }

  /** Starts authentication, connectivity, and Processor lifecycle observation. */
  start(): void {
    this.#startSubjectProgram()
    this.#unsubscribeAuthentication = observeAuthentication(
      this.#database,
      authentication => {
        this.#authentication = authentication
        if (authentication._tag !== 'LoadingAuthentication') {
          this.#maybeSentEmail = Option.none()
        }
        this.#reconcileAuthentication(authentication)
        this.#render()
      },
    )
    this.#unsubscribeConnection = this.#database.subscribeConnectionStatus(
      status => {
        this.#connectionStatus = status
        this.#render()
      },
    )
    this.#render()
  }

  /** Stops observers and closes the authenticated-subject Program Scope. */
  stop(): void {
    this.#unsubscribeAuthentication?.()
    this.#unsubscribeAuthentication = null
    this.#unsubscribeConnection?.()
    this.#unsubscribeConnection = null
    const subjectProgramScope = this.#subjectProgramScope
    this.#subjectProgram = null
    this.#subjectProgramScope = null
    this.#subjectProgramSnapshot = null
    if (subjectProgramScope !== null) {
      void Effect.runPromise(Scope.close(subjectProgramScope, Exit.void))
    }
  }

  #startSubjectProgram(): void {
    const subjectProgramScope = Effect.runSync(Scope.make())
    const subjectProgram = Effect.runSync(
      Effect.provideService(
        makeSubjectScopedProgram<BrowserProcessor, BrowserProgramSnapshot>({
          allocateProgram: context => this.#allocateSubjectProgram(context),
          signOut: () => Effect.promise(() => signOut(this.#database)),
        }),
        Scope.Scope,
        subjectProgramScope,
      ),
    )
    this.#subjectProgramScope = subjectProgramScope
    this.#subjectProgram = subjectProgram
    this.#subjectProgramSnapshot = Effect.runSync(subjectProgram.read)
    Effect.runSync(
      Effect.forkIn(
        Stream.runForEach(subjectProgram.snapshots, snapshot =>
          Effect.sync(() => this.#receiveSubjectProgramSnapshot(snapshot)),
        ),
        subjectProgramScope,
      ),
    )
  }

  #allocateSubjectProgram(
    context: SubjectScopedProgramAllocationContext<BrowserProgramSnapshot>,
  ): Effect.Effect<BrowserProcessor, never, Scope.Scope> {
    const app = this
    return Effect.gen(function* () {
      const allocation = yield* Effect.acquireRelease(
        Effect.promise(signal =>
          allocateBrowserProcessor(
            {
              actorSequences: app.#actorSequences,
              attemptRegistry: app.#attemptRegistry,
              database: app.#database,
              identity: app.#identity,
              subjectId: context.subjectId,
            },
            signal,
          ),
        ),
        allocation => Effect.promise(() => allocation.release()),
      )
      const processor = allocation.processor
      const initialSharedSnapshot = yield* processor.shared.readSnapshot
      const programSnapshotRef = yield* Ref.make<BrowserProgramSnapshot>({
        presence: [],
        shared: initialSharedSnapshot,
      })
      const publishSharedSnapshot = (
        shared: SharedProgramProcessorSnapshot<Model>,
      ): Effect.Effect<void> =>
        Ref.updateAndGet(programSnapshotRef, programSnapshot => ({
          ...programSnapshot,
          shared,
        })).pipe(Effect.flatMap(context.publishProgramSnapshot))
      const publishPresence = (
        presence: ReadonlyArray<Processor.Descriptor>,
      ): Effect.Effect<void> =>
        Ref.updateAndGet(programSnapshotRef, programSnapshot => ({
          ...programSnapshot,
          presence,
        })).pipe(Effect.flatMap(context.publishProgramSnapshot))

      yield* Effect.acquireRelease(
        Effect.sync(() =>
          observeProcessorSnapshots(processor, snapshot => {
            Effect.runSync(publishSharedSnapshot(snapshot))
          }),
        ),
        detachSnapshots => Effect.promise(() => detachSnapshots()),
      )
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          observeProcessorPresence(processor, presence => {
            Effect.runSync(publishPresence(decodeProcessorPresence(presence)))
          }),
        ),
        detachPresence => Effect.promise(() => detachPresence()),
      )
      yield* Effect.addFinalizer(() => processor.shared.disconnect)
      yield* Effect.addFinalizer(() =>
        processor.publishEffectExecutorAvailability(false),
      )
      yield* Ref.get(programSnapshotRef).pipe(
        Effect.flatMap(context.publishProgramSnapshot),
      )
      const subjectScope = yield* Effect.scope
      yield* Effect.forkIn(
        Effect.gen(function* () {
          yield* processor.shared.connect
          yield* processor.publishEffectExecutorAvailability(true)
        }).pipe(Effect.catch(() => Effect.void)),
        subjectScope,
      )
      return processor
    })
  }

  #reconcileAuthentication(authentication: Authentication): void {
    const subjectProgram = this.#subjectProgram
    const subjectProgramScope = this.#subjectProgramScope
    if (subjectProgram === null || subjectProgramScope === null) {
      return
    }
    const maybeSubjectId =
      authentication._tag === 'SignedIn'
        ? Option.some(authentication.subjectId)
        : Option.none()
    Effect.runSync(
      Effect.forkIn(
        subjectProgram
          .reconcileAuthenticatedSubject(maybeSubjectId)
          .pipe(Effect.catchCause(() => Effect.void)),
        subjectProgramScope,
      ),
    )
    this.#subjectProgramSnapshot = Effect.runSync(subjectProgram.read)
  }

  #receiveSubjectProgramSnapshot(
    snapshot: BrowserSubjectProgramSnapshot,
  ): void {
    const previousLifecycle = this.#subjectProgramSnapshot?.lifecycle
    this.#subjectProgramSnapshot = snapshot
    if (snapshot.lifecycle._tag === 'AllocatingSubjectScopedProgram') {
      this.#maybeNotice = Option.some(
        'Restoring the cached accepted tape for this subject.',
      )
    } else if (snapshot.lifecycle._tag === 'FailedSubjectScopedProgram') {
      this.#maybeNotice = Option.some(
        'The Processor could not start. Confirm the Instant schema, permissions, and headless admission sequencer are running.',
      )
    } else if (
      snapshot.lifecycle._tag === 'ActiveSubjectScopedProgram' &&
      previousLifecycle?._tag === 'AllocatingSubjectScopedProgram'
    ) {
      this.#maybeNotice = Option.none()
    }
    this.#render()
  }

  #activeSubjectProgram(): SubjectScopedProgramActive<
    BrowserProcessor,
    BrowserProgramSnapshot
  > | null {
    const subjectProgramSnapshot = this.#subjectProgramSnapshot
    if (
      subjectProgramSnapshot === null ||
      Option.isNone(subjectProgramSnapshot.maybeActiveProgram)
    ) {
      return null
    }
    return subjectProgramSnapshot.maybeActiveProgram.value
  }

  #propose(message: import('../domain/message.js').Message): void {
    const activeSubjectProgram = this.#activeSubjectProgram()
    if (activeSubjectProgram === null) {
      this.#maybeNotice = Option.some('No Processor is running yet.')
      this.#render()
      return
    }
    void Effect.runPromise(
      activeSubjectProgram.program.shared.propose(message),
    ).catch(() => {
      this.#maybeNotice = Option.some(
        'The Message remains local because its proposal could not be written yet.',
      )
      this.#render()
    })
  }

  #proposeEffect(kind: EffectRequestKind): void {
    const durationMs =
      kind === 'DeviceTimer' || kind === 'BackgroundTimer'
        ? Option.some(1_500)
        : Option.none()
    this.#propose(
      RequestedEffect({
        durationMs,
        kind,
        requestId: randomId(),
      }),
    )
  }

  #inspectReplay(frame: number): void {
    const activeSubjectProgram = this.#activeSubjectProgram()
    if (activeSubjectProgram === null) {
      return
    }
    void Effect.runPromise(
      activeSubjectProgram.program.shared.inspectReplay(frame),
    ).catch(() => {
      this.#maybeNotice = Option.some(
        `Replay frame ${frame.toString()} is unavailable.`,
      )
      this.#render()
    })
  }

  #returnLive(): void {
    const activeSubjectProgram = this.#activeSubjectProgram()
    if (activeSubjectProgram !== null) {
      void Effect.runPromise(activeSubjectProgram.program.shared.returnLive)
    }
  }

  #disconnect(): void {
    const activeSubjectProgram = this.#activeSubjectProgram()
    if (activeSubjectProgram === null) {
      return
    }
    const processor = activeSubjectProgram.program
    this.#maybeNotice = Option.some('Disconnecting this Model…')
    this.#render()
    void Effect.runPromise(processor.publishEffectExecutorAvailability(false))
      .then(() => Effect.runPromise(processor.shared.disconnect))
      .then(() => {
        if (this.#activeSubjectProgram()?.program === processor) {
          this.#maybeNotice = Option.none()
          this.#render()
        }
      })
      .catch(() => {
        if (this.#activeSubjectProgram()?.program === processor) {
          this.#maybeNotice = Option.some(
            'This Model could not disconnect from the live accepted tape.',
          )
          this.#render()
        }
      })
  }

  #connect(): void {
    const activeSubjectProgram = this.#activeSubjectProgram()
    if (activeSubjectProgram === null) {
      return
    }
    const processor = activeSubjectProgram.program
    void Effect.runPromise(
      Effect.gen(function* () {
        yield* processor.shared.disconnect
        yield* processor.shared.connect
        yield* processor.publishEffectExecutorAvailability(true)
      }),
    ).catch(() => {
      if (this.#activeSubjectProgram()?.program === processor) {
        this.#maybeNotice = Option.some(
          'Reconnect failed. The cached accepted Model is still available.',
        )
        this.#render()
      }
    })
  }

  #sendMagicCode(email: string): void {
    this.#maybeNotice = Option.some('Sending a one-time code…')
    this.#render()
    void sendMagicCode(this.#database, email)
      .then(() => {
        this.#maybeSentEmail = Option.some(email)
        this.#maybeNotice = Option.some('Check your email for the code.')
        this.#render()
      })
      .catch(() => {
        this.#maybeNotice = Option.some(
          'Instant could not send that code. Check the address and try again.',
        )
        this.#render()
      })
  }

  #signInWithMagicCode(email: string, code: string): void {
    this.#maybeNotice = Option.some('Verifying the code…')
    this.#render()
    void signInWithMagicCode(this.#database, email, code).catch(() => {
      this.#maybeNotice = Option.some(
        'That code was not accepted. Request a new code and try again.',
      )
      this.#render()
    })
  }

  #signOut(): void {
    const subjectProgram = this.#subjectProgram
    if (subjectProgram === null) {
      return
    }
    this.#maybeSentEmail = Option.none()
    this.#maybeNotice = Option.some('Signing out and closing this Processor…')
    this.#render()
    void Effect.runPromise(subjectProgram.signOut).catch(() => {
      this.#maybeNotice = Option.some('Instant could not complete sign out.')
      this.#render()
    })
  }

  #render(): void {
    const activeSubjectProgram = this.#activeSubjectProgram()
    const maybeProgramSnapshot = activeSubjectProgram?.maybeProgramSnapshot
    const programSnapshot =
      maybeProgramSnapshot === undefined || Option.isNone(maybeProgramSnapshot)
        ? null
        : maybeProgramSnapshot.value
    renderBrowserView(
      this.#root,
      {
        authentication: this.#authentication,
        connectionStatus: this.#connectionStatus,
        localDescriptor: activeSubjectProgram?.program.descriptor ?? null,
        maybeNotice: this.#maybeNotice,
        maybeSentEmail: this.#maybeSentEmail,
        presence: programSnapshot?.presence ?? [],
        snapshot: programSnapshot?.shared ?? null,
      },
      this.#actions,
    )
  }
}
