import {
  MultipleCountersProgram,
  SelectedCounter,
  update,
} from 'counters-core-example'
import { Effect, Exit, Option, Scope } from 'effect'
import {
  AttachedFoldkitRendererDefect,
  makeAttachedFoldkitApplication,
} from 'foldkit/runtime'
import * as Synchronization from 'foldkit/synchronization'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ActiveSubjectScopedProgram,
  type V3TerminalProgramClaim,
} from '@foldkit/instant'

import type { MultipleCountersV3ClientSnapshot } from '../client/controller.js'
import {
  isMultipleCountersV3ObserveFollower,
  makeMultipleCountersV3BrowserHost,
  multipleCountersV3DestinationUriFromPathname,
  multipleCountersV3FollowMode,
  multipleCountersV3NewTerminalRejection,
  multipleCountersV3RendererDefectState,
  setMultipleCountersV3BrowserHostVisibility,
} from './app.js'
import { MultipleCountersV3BrowserClientInput } from './clientInput.js'
import { multipleCountersV3BrowserView } from './view.js'

const [initialModel] = MultipleCountersProgram.init()

const clientSnapshot = (
  recentTerminalClaims: ReadonlyArray<V3TerminalProgramClaim>,
): MultipleCountersV3ClientSnapshot => ({
  lifecycle: ActiveSubjectScopedProgram.make({
    generation: 2,
    subjectId: 'subject-a',
  }),
  maybeActiveProgram: Option.some({
    generation: 2,
    processorId: 'processor-browser',
    processorSnapshot: {
      acceptedModel: initialModel,
      activeProgramSession: Option.none(),
      activeSessionPolicy: Option.some(
        Synchronization.SessionPolicy.make({
          generation: 2,
          mode: Synchronization.SharedDomain.make({}),
        }),
      ),
      connection: { _tag: 'Attached', transportStatus: 'Authenticated' },
      lastError: Option.none(),
      optimisticModel: initialModel,
      pendingClaims: [],
      recentTerminalClaims,
      throughAcceptedSequence: 0,
      waitingForAcceptedSequence: Option.some(1),
    },
    subjectId: 'subject-a',
  }),
  model: initialModel,
})

describe('Multiple Counters v3 browser host', () => {
  beforeEach(() => {
    document.head.replaceChildren()
    document.body.innerHTML = '<div id="test-root"></div>'
    window.history.replaceState({}, '', '/counters')
  })

  afterEach(() => {
    document.head.replaceChildren()
    document.body.replaceChildren()
  })

  it('canonicalizes only the browser root and preserves Program-invalid carriers', () => {
    expect(multipleCountersV3DestinationUriFromPathname('/')).toBe('/counters')
    expect(
      multipleCountersV3DestinationUriFromPathname('/counters/counter-1'),
    ).toBe('/counters/counter-1')
    expect(multipleCountersV3DestinationUriFromPathname('/missing')).toBe(
      '/missing',
    )
  })

  it('makes Patch terminal without exposing its untyped cause', () => {
    const state = multipleCountersV3RendererDefectState(
      new AttachedFoldkitRendererDefect({
        cause: { processorSecretKey: 'must-not-escape' },
        operation: 'Patch',
        programId: 'multiple-counters',
      }),
    )

    expect(state.isTerminal).toBe(true)
    expect(state.notice).toContain('Reload')
    expect(state.notice).not.toContain('must-not-escape')
  })

  it('makes View terminal and keeps input decoding recoverable', () => {
    const view = multipleCountersV3RendererDefectState(
      new AttachedFoldkitRendererDefect({
        cause: new Error('view failed'),
        operation: 'View',
        programId: 'multiple-counters',
      }),
    )
    const input = multipleCountersV3RendererDefectState(
      new AttachedFoldkitRendererDefect({
        cause: new Error('input failed'),
        operation: 'DecodeClientInput',
        programId: 'multiple-counters',
      }),
    )

    expect(view.isTerminal).toBe(true)
    expect(input.isTerminal).toBe(false)
  })

  it('constructs Follow only for distinct Processor identities', () => {
    expect(
      multipleCountersV3FollowMode(
        'processor-mac',
        'processor-phone',
        'Observe',
      ),
    ).toEqual(
      Option.some(
        Synchronization.Follow.make({
          followers: [
            Synchronization.Follower.make({
              control: 'Observe',
              processorId: 'processor-phone',
            }),
          ],
          leaderProcessorId: 'processor-mac',
        }),
      ),
    )
    expect(
      multipleCountersV3FollowMode(
        'processor-mac',
        'processor-mac',
        'RemoteControl',
      ),
    ).toEqual(Option.none())
    expect(
      multipleCountersV3FollowMode(
        'processor.bad',
        'processor-phone',
        'Observe',
      ),
    ).toEqual(Option.none())
    expect(
      multipleCountersV3FollowMode(
        'processor-mac',
        'p'.repeat(129),
        'RemoteControl',
      ),
    ).toEqual(Option.none())
  })

  it('identifies a new authority rejection that rolls back optimism', () => {
    const previous = clientSnapshot([])
    const next = clientSnapshot([
      {
        maybeRejectionReason: Option.some('AdmissionClaimRejected'),
        proposalId: 'proposal-rejected',
        resolutionState: 'Rejected',
        resolvedAtMs: 100,
      },
    ])

    expect(multipleCountersV3NewTerminalRejection(previous, next)).toEqual(
      Option.some({
        maybeRejectionReason: Option.some('AdmissionClaimRejected'),
        proposalId: 'proposal-rejected',
        resolutionState: 'Rejected',
        resolvedAtMs: 100,
      }),
    )
    expect(multipleCountersV3NewTerminalRejection(null, next)).toEqual(
      Option.none(),
    )
  })

  it('keeps authentication and chrome mounted when the renderer replaces its own root', async () => {
    const root = document.getElementById('test-root')
    if (root === null) {
      throw new Error('Expected the browser test root.')
    }
    const host = makeMultipleCountersV3BrowserHost(root)
    const scope = Effect.runSync(Scope.make())
    const application = Effect.runSync(
      makeAttachedFoldkitApplication({
        ClientInput: MultipleCountersV3BrowserClientInput,
        container: host.programMount,
        program: MultipleCountersProgram,
        sendClientInput: () => {},
        source: {
          readModel: () => initialModel,
          subscribe: () => () => {},
        },
        view: model =>
          multipleCountersV3BrowserView(model, {
            isNavigationEnabled: false,
          }),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )

    try {
      expect(host.programMount.isConnected).toBe(false)
      expect(host.programShell.isConnected).toBe(true)
      expect(host.authRoot.isConnected).toBe(true)
      expect(host.chromeRoot.isConnected).toBe(true)
      expect(host.programShell.querySelector('main')).not.toBeNull()
      const buttons = Array.from(host.programShell.querySelectorAll('button'))
      const details = buttons.find(button => button.textContent === 'Details')
      const increment = buttons.find(button => button.textContent === '+')
      expect(details?.disabled).toBe(true)
      expect(increment?.disabled).toBe(false)

      setMultipleCountersV3BrowserHostVisibility(host, false)
      expect(host.authRoot.hidden).toBe(false)
      expect(host.programShell.hidden).toBe(true)
      expect(host.chromeRoot.hidden).toBe(true)

      setMultipleCountersV3BrowserHostVisibility(host, true)
      expect(host.authRoot.hidden).toBe(true)
      expect(host.programShell.hidden).toBe(false)
      expect(host.chromeRoot.hidden).toBe(false)
    } finally {
      await Effect.runPromise(application.shutdown)
      await Effect.runPromise(Scope.close(scope, Exit.void))
    }
  })

  it('recognizes only this Processor as a read-only Follow observer', () => {
    const followSnapshot: MultipleCountersV3ClientSnapshot = {
      lifecycle: ActiveSubjectScopedProgram.make({
        generation: 2,
        subjectId: 'subject-a',
      }),
      maybeActiveProgram: Option.some({
        generation: 2,
        processorId: 'processor-follower',
        processorSnapshot: {
          acceptedModel: initialModel,
          activeProgramSession: Option.none(),
          activeSessionPolicy: Option.some(
            Synchronization.SessionPolicy.make({
              generation: 2,
              mode: Synchronization.Follow.make({
                followers: [
                  Synchronization.Follower.make({
                    control: 'Observe',
                    processorId: 'processor-follower',
                  }),
                ],
                leaderProcessorId: 'processor-leader',
              }),
            }),
          ),
          connection: { _tag: 'Attached', transportStatus: 'Authenticated' },
          lastError: Option.none(),
          optimisticModel: initialModel,
          pendingClaims: [],
          recentTerminalClaims: [],
          throughAcceptedSequence: 0,
          waitingForAcceptedSequence: Option.none(),
        },
        subjectId: 'subject-a',
      }),
      model: initialModel,
    }

    expect(isMultipleCountersV3ObserveFollower(followSnapshot)).toBe(true)
  })

  it('replaces detail DOM identity when navigation selects another Counter', async () => {
    const root = document.getElementById('test-root')
    if (root === null) {
      throw new Error('Expected the browser test root.')
    }
    const [firstDetail] = update(
      initialModel,
      SelectedCounter({
        counterId: 'counter-1',
        detailPresentationId: 'detail-1',
      }),
    )
    const [secondDetail] = update(
      initialModel,
      SelectedCounter({
        counterId: 'counter-2',
        detailPresentationId: 'detail-2',
      }),
    )
    let listener = (_model: typeof initialModel): void => {}
    const host = makeMultipleCountersV3BrowserHost(root)
    const scope = Effect.runSync(Scope.make())
    const application = Effect.runSync(
      makeAttachedFoldkitApplication({
        ClientInput: MultipleCountersV3BrowserClientInput,
        container: host.programMount,
        program: MultipleCountersProgram,
        sendClientInput: () => {},
        source: {
          readModel: () => firstDetail,
          subscribe: nextListener => {
            listener = nextListener
            return () => {}
          },
        },
        view: multipleCountersV3BrowserView,
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )

    try {
      const firstElement = host.programShell.querySelector('.v3-counter-detail')
      listener(secondDetail)
      const secondElement =
        host.programShell.querySelector('.v3-counter-detail')
      expect(firstElement).not.toBeNull()
      expect(secondElement).not.toBeNull()
      expect(secondElement).not.toBe(firstElement)
    } finally {
      await Effect.runPromise(application.shutdown)
      await Effect.runPromise(Scope.close(scope, Exit.void))
    }
  })
})
