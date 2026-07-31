import * as Counter from 'counter-core-example'
import { Array as Array_, Option } from 'effect'
import {
  Model as InstantCounterModel,
  type Message,
} from 'instant-counter-example/domain'
import { describe, expect, it } from 'vitest'

import {
  type CounterProcessorLease,
  type CounterProcessorSnapshot,
  NativeCounterController,
  SignedInAuthentication,
  SignedOutAuthentication,
} from './controller'

type TestLease = Readonly<{
  emit: (snapshot: CounterProcessorSnapshot) => void
  lease: CounterProcessorLease
  messages: Array<Message>
}>

const makeSnapshot = (
  subjectId: string,
  count: number,
  acceptedSequence: number,
  replayFrame?: number,
): CounterProcessorSnapshot => {
  const model = InstantCounterModel.make({
    counter: Counter.Model.make({ count }),
    effects: [],
  })
  return {
    acceptedModel: model,
    acceptedSequence,
    connection: {
      _tag: 'Attached',
      transportStatus: 'authenticated',
    },
    displayedModel: model,
    pendingProposals: [],
    programId: 'instant-counter',
    programVersion: 1,
    replayMode:
      replayFrame === undefined
        ? { _tag: 'Live' }
        : { _tag: 'Inspecting', frame: replayFrame },
    sessionId: `session-${subjectId}`,
    subjectId,
  }
}

const makeTestLease = (
  subjectId: string,
  trace: Array<string>,
  proposalFailure?: Error,
): TestLease => {
  const messages: Array<Message> = []
  let listener: ((snapshot: CounterProcessorSnapshot) => void) | null = null
  const initialSnapshot = makeSnapshot(subjectId, 7, 3)
  return {
    emit: snapshot => {
      listener?.(snapshot)
    },
    lease: {
      connect: () => {
        trace.push('connect')
        return Promise.resolve()
      },
      disconnect: () => {
        trace.push('disconnect')
        return Promise.resolve()
      },
      observe: nextListener => {
        trace.push('observe')
        listener = nextListener
        return () => {
          trace.push('detach')
          listener = null
          return Promise.resolve()
        }
      },
      propose: message => {
        trace.push(`propose:${message._tag}`)
        messages.push(message)
        return proposalFailure === undefined
          ? Promise.resolve()
          : Promise.reject(proposalFailure)
      },
      publishUnavailable: () => {
        trace.push('publish-unavailable')
        return Promise.resolve()
      },
      readSnapshot: () => {
        trace.push('read-snapshot')
        return Promise.resolve(initialSnapshot)
      },
      release: () => {
        trace.push('release-scope')
        return Promise.resolve()
      },
    },
    messages,
  }
}

const makeHarness = (proposalFailure?: Error) => {
  const trace: Array<string> = []
  const leases = new Map<string, TestLease>()
  const controller = new NativeCounterController({
    authentication: {
      sendMagicCode: () => Promise.resolve(),
      signInWithMagicCode: () => Promise.resolve(),
      signOut: () => {
        trace.push('auth-sign-out')
        return Promise.resolve()
      },
    },
    processorGateway: {
      allocate: subjectId => {
        trace.push(`allocate:${subjectId}`)
        const lease = makeTestLease(subjectId, trace, proposalFailure)
        leases.set(subjectId, lease)
        return Promise.resolve(lease.lease)
      },
    },
  })
  return { controller, leases, trace }
}

const signIn = async (
  controller: NativeCounterController,
  subjectId = 'subject-a',
): Promise<void> => {
  controller.authenticationChanged(
    SignedInAuthentication.make({
      maybeEmail: Option.some('counter@example.com'),
      subjectId,
    }),
  )
  await controller.settled()
}

describe('native counter controller', () => {
  it('maps actions only to canonical Counter proposals and observes snapshots', async () => {
    const harness = makeHarness()
    await signIn(harness.controller)
    const lease = harness.leases.get('subject-a')
    expect(lease).toBeDefined()
    if (lease === undefined) {
      return
    }

    await harness.controller.increment()
    await harness.controller.decrement()
    await harness.controller.reset()
    lease.emit(makeSnapshot('subject-a', 41, 9, 4))

    expect(lease.messages.map(message => message._tag)).toStrictEqual([
      'ClickedIncrement',
      'ClickedDecrement',
      'ClickedReset',
    ])
    expect(harness.controller.getSnapshot()).toMatchObject({
      acceptedSequence: 9,
      count: 41,
      displayedSequence: 4,
      pendingCount: 0,
      processorConnection: 'Attached · authenticated',
    })
  })

  it('aborts an in-flight startup and ignores its late allocation', async () => {
    const trace: Array<string> = []
    const allocation = Promise.withResolvers<CounterProcessorLease>()
    const startupSignals: Array<AbortSignal> = []
    const controller = new NativeCounterController({
      authentication: {
        sendMagicCode: () => Promise.resolve(),
        signInWithMagicCode: () => Promise.resolve(),
        signOut: () => Promise.resolve(),
      },
      processorGateway: {
        allocate: (_subjectId, signal) => {
          startupSignals.push(signal)
          trace.push('allocate')
          return allocation.promise
        },
      },
    })
    controller.authenticationChanged(
      SignedInAuthentication.make({
        maybeEmail: Option.none(),
        subjectId: 'subject-a',
      }),
    )
    await Promise.resolve()
    await Promise.resolve()
    controller.authenticationChanged(SignedOutAuthentication.make({}))
    const maybeStartupSignal = Array_.head(startupSignals)

    expect(Option.isSome(maybeStartupSignal)).toBe(true)
    if (Option.isSome(maybeStartupSignal)) {
      expect(maybeStartupSignal.value.aborted).toBe(true)
    }
    allocation.resolve(makeTestLease('subject-a', trace).lease)
    await controller.settled()

    expect(controller.getSnapshot().processorLifecycle._tag).toBe(
      'IdleProcessor',
    )
    expect(controller.getSnapshot().isActionFenceOpen).toBe(false)
    expect(trace).toContain('release-scope')
  })

  it('fences actions and releases in order before native auth sign-out', async () => {
    const harness = makeHarness()
    await signIn(harness.controller)
    harness.trace.splice(0)

    const signingOut = harness.controller.signOut()
    await harness.controller.increment()
    await signingOut

    expect(harness.trace).toStrictEqual([
      'publish-unavailable',
      'disconnect',
      'detach',
      'release-scope',
      'auth-sign-out',
    ])
  })

  it('reconnects in explicit unavailable, disconnect, connect order', async () => {
    const harness = makeHarness()
    await signIn(harness.controller)
    await harness.controller.disconnect()
    harness.trace.splice(0)

    await harness.controller.reconnect()

    expect(harness.trace).toStrictEqual([
      'publish-unavailable',
      'disconnect',
      'connect',
      'publish-unavailable',
    ])
    expect(harness.controller.getSnapshot().processorLifecycle._tag).toBe(
      'ReadyProcessor',
    )
  })

  it('clears one subject before releasing and replacing its Processor', async () => {
    const harness = makeHarness()
    await signIn(harness.controller)
    harness.trace.splice(0)

    harness.controller.authenticationChanged(
      SignedInAuthentication.make({
        maybeEmail: Option.none(),
        subjectId: 'subject-b',
      }),
    )
    expect(harness.controller.getSnapshot()).toMatchObject({
      acceptedSequence: 0,
      count: 0,
      displayedSequence: 0,
      isActionFenceOpen: false,
    })
    await harness.controller.settled()

    expect(harness.trace).toStrictEqual([
      'publish-unavailable',
      'disconnect',
      'detach',
      'release-scope',
      'allocate:subject-b',
      'observe',
      'read-snapshot',
      'connect',
      'publish-unavailable',
    ])
    expect(harness.controller.getSnapshot().count).toBe(7)
  })

  it('sanitizes proposal failures without exposing their cause', async () => {
    const harness = makeHarness(
      new Error('secret-token=do-not-render-this-value'),
    )
    await signIn(harness.controller)

    await harness.controller.increment()

    const notice = Option.getOrElse(
      harness.controller.getSnapshot().maybeNotice,
      () => '',
    )
    expect(notice).toBe(
      'The counter proposal could not be written. The accepted count is unchanged.',
    )
    expect(notice).not.toContain('secret-token')
  })
})
