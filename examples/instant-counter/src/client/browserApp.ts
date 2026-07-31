import { Effect, Option } from 'effect'
import { Processor } from 'foldkit'

import type { SharedProgramProcessorSnapshot } from '@foldkit/instant'
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

type ProcessorLease = Readonly<{
  detachPresence: () => Promise<void>
  detachSnapshots: () => Promise<void>
  processor: BrowserProcessor
  release: () => Promise<void>
}>

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
  #generation = 0
  #maybeNotice = Option.none<string>()
  #maybeSentEmail = Option.none<string>()
  #presence: ReadonlyArray<Processor.Descriptor> = []
  #processorLease: ProcessorLease | null = null
  #snapshot: SharedProgramProcessorSnapshot<Model> | null = null
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
    this.#unsubscribeAuthentication = observeAuthentication(
      this.#database,
      authentication => {
        const previousSubject =
          this.#authentication._tag === 'SignedIn'
            ? this.#authentication.subjectId
            : null
        this.#authentication = authentication
        const nextSubject =
          authentication._tag === 'SignedIn' ? authentication.subjectId : null
        if (
          authentication._tag === 'SignedIn' ||
          previousSubject !== nextSubject
        ) {
          this.#maybeSentEmail = Option.none()
        }
        if (nextSubject !== previousSubject) {
          this.#generation += 1
          void this.#replaceProcessor(nextSubject, this.#generation)
        }
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

  /** Stops observers and releases the signed-in Processor. */
  stop(): void {
    this.#generation += 1
    this.#unsubscribeAuthentication?.()
    this.#unsubscribeAuthentication = null
    this.#unsubscribeConnection?.()
    this.#unsubscribeConnection = null
    void this.#releaseProcessor()
  }

  async #replaceProcessor(
    subjectId: string | null,
    generation: number,
  ): Promise<void> {
    await this.#releaseProcessor()
    if (subjectId === null || generation !== this.#generation) {
      return
    }
    this.#snapshot = null
    this.#presence = []
    this.#maybeNotice = Option.some(
      'Restoring the cached accepted tape for this subject.',
    )
    this.#render()
    try {
      const allocation = await allocateBrowserProcessor({
        actorSequences: this.#actorSequences,
        attemptRegistry: this.#attemptRegistry,
        database: this.#database,
        identity: this.#identity,
        subjectId,
      })
      if (generation !== this.#generation) {
        await allocation.release()
        return
      }
      const detachSnapshots = observeProcessorSnapshots(
        allocation.processor,
        snapshot => {
          this.#snapshot = snapshot
          this.#render()
        },
      )
      const detachPresence = observeProcessorPresence(
        allocation.processor,
        presence => {
          this.#presence = decodeProcessorPresence(presence)
          this.#render()
        },
      )
      this.#processorLease = {
        detachPresence,
        detachSnapshots,
        processor: allocation.processor,
        release: allocation.release,
      }
      this.#snapshot = await Effect.runPromise(
        allocation.processor.shared.readSnapshot,
      )
      this.#maybeNotice = Option.none()
      this.#render()
      await Effect.runPromise(allocation.processor.shared.connect)
      await Effect.runPromise(
        allocation.processor.publishEffectExecutorAvailability(true),
      )
    } catch {
      if (generation === this.#generation) {
        this.#maybeNotice = Option.some(
          'The Processor could not start. Confirm the Instant schema, permissions, and headless authority are running.',
        )
        this.#render()
      }
    }
  }

  async #releaseProcessor(): Promise<void> {
    const lease = this.#processorLease
    this.#processorLease = null
    this.#snapshot = null
    this.#presence = []
    if (lease === null) {
      return
    }
    await lease.detachPresence()
    await lease.detachSnapshots()
    await Effect.runPromise(lease.processor.shared.disconnect)
    await lease.release()
  }

  #propose(message: import('../domain/message.js').Message): void {
    const lease = this.#processorLease
    if (lease === null) {
      this.#maybeNotice = Option.some('No Processor is running yet.')
      this.#render()
      return
    }
    void Effect.runPromise(lease.processor.shared.propose(message)).catch(
      () => {
        this.#maybeNotice = Option.some(
          'The Message remains local because its proposal could not be written yet.',
        )
        this.#render()
      },
    )
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
    const lease = this.#processorLease
    if (lease === null) {
      return
    }
    void Effect.runPromise(lease.processor.shared.inspectReplay(frame)).catch(
      () => {
        this.#maybeNotice = Option.some(
          `Replay frame ${frame.toString()} is unavailable.`,
        )
        this.#render()
      },
    )
  }

  #returnLive(): void {
    const lease = this.#processorLease
    if (lease !== null) {
      void Effect.runPromise(lease.processor.shared.returnLive)
    }
  }

  #disconnect(): void {
    const lease = this.#processorLease
    if (lease !== null) {
      this.#maybeNotice = Option.some('Disconnecting this Model…')
      this.#render()
      void Effect.runPromise(lease.processor.shared.disconnect)
        .then(() => Effect.runPromise(lease.processor.shared.readSnapshot))
        .then(snapshot => {
          if (this.#processorLease === lease) {
            this.#snapshot = snapshot
            this.#maybeNotice = Option.none()
            this.#render()
          }
          return Effect.runPromise(
            lease.processor.publishEffectExecutorAvailability(false),
          )
        })
        .catch(() => {
          if (this.#processorLease === lease) {
            this.#maybeNotice = Option.some(
              'This Model could not disconnect from the live accepted tape.',
            )
            this.#render()
          }
        })
    }
  }

  #connect(): void {
    const lease = this.#processorLease
    if (lease !== null) {
      void Effect.runPromise(
        Effect.gen(function* () {
          yield* lease.processor.shared.disconnect
          yield* lease.processor.shared.connect
          yield* lease.processor.publishEffectExecutorAvailability(true)
        }),
      ).catch(() => {
        this.#maybeNotice = Option.some(
          'Reconnect failed. The cached accepted Model is still available.',
        )
        this.#render()
      })
    }
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
    this.#maybeSentEmail = Option.none()
    void signOut(this.#database).catch(() => {
      this.#maybeNotice = Option.some('Instant could not complete sign out.')
      this.#render()
    })
  }

  #render(): void {
    renderBrowserView(
      this.#root,
      {
        authentication: this.#authentication,
        connectionStatus: this.#connectionStatus,
        localDescriptor: this.#processorLease?.processor.descriptor ?? null,
        maybeNotice: this.#maybeNotice,
        maybeSentEmail: this.#maybeSentEmail,
        presence: this.#presence,
        snapshot: this.#snapshot,
      },
      this.#actions,
    )
  }
}
