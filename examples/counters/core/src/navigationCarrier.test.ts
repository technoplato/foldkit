import { Result } from 'effect'
import {
  InteractionInvocationFacts,
  interactionAdmissionLimits,
} from 'foldkit/interaction-graph'
import { describe, expect, it } from 'vitest'

import { init } from './init.js'
import {
  ClickedAddCounter,
  CounterDetailOpening,
  CounterDetailTarget,
  CounterFactOpening,
  CounterFactTarget,
  CounterListOpening,
  CounterListTarget,
  DeleteCounterOpening,
  DeleteCounterTarget,
  OpenedNavigation,
} from './message.js'
import {
  InvalidNavigationCarrierInvocationFactsError,
  InvalidNavigationCarrierUriError,
  MissingNavigationCarrierDestinationError,
  NonCanonicalNavigationCarrierUriError,
  resolveNavigationCarrier,
} from './navigationCarrier.js'
import { navigationTargetToPath, pathToNavigationTarget } from './route.js'
import { update } from './update.js'

const invocationFacts = InteractionInvocationFacts.make({
  occurrenceId: 'occurrence-carrier',
  actorId: 'actor-1',
  clientId: 'client-1',
  originatingProcessorId: 'processor-1',
  sessionId: 'session-1',
  subjectId: 'subject-1',
})

describe('Multiple Counters navigation carrier', () => {
  it('resolves one canonical URI into one deterministic OpenedNavigation Message', () => {
    const [model] = init()
    const first = resolveNavigationCarrier(
      model,
      '/counters/counter-1/delete',
      invocationFacts,
    )
    const second = resolveNavigationCarrier(
      model,
      '/counters/counter-1/delete',
      invocationFacts,
    )

    expect(first).toStrictEqual(second)
    expect(first).toStrictEqual(
      Result.succeed(
        OpenedNavigation({
          opening: DeleteCounterOpening.make({
            confirmationId: 'delete-occurrence-carrier',
            presentationId: 'detail-occurrence-carrier',
            target: DeleteCounterTarget.make({
              counterId: 'counter-1',
            }),
          }),
        }),
      ),
    )
  })

  it('covers every Program-owned navigation destination mode', () => {
    const [model] = init()

    expect([
      resolveNavigationCarrier(model, '/counters', invocationFacts),
      resolveNavigationCarrier(model, '/counters/counter-1', invocationFacts),
      resolveNavigationCarrier(
        model,
        '/counters/counter-1/fact',
        invocationFacts,
      ),
      resolveNavigationCarrier(
        model,
        '/counters/counter-1/delete',
        invocationFacts,
      ),
    ]).toStrictEqual([
      Result.succeed(
        OpenedNavigation({
          opening: CounterListOpening.make({
            target: CounterListTarget.make({}),
          }),
        }),
      ),
      Result.succeed(
        OpenedNavigation({
          opening: CounterDetailOpening.make({
            presentationId: 'detail-occurrence-carrier',
            target: CounterDetailTarget.make({ counterId: 'counter-1' }),
          }),
        }),
      ),
      Result.succeed(
        OpenedNavigation({
          opening: CounterFactOpening.make({
            presentationId: 'detail-occurrence-carrier',
            requestId: 'fact-occurrence-carrier',
            target: CounterFactTarget.make({ counterId: 'counter-1' }),
          }),
        }),
      ),
      Result.succeed(
        OpenedNavigation({
          opening: DeleteCounterOpening.make({
            confirmationId: 'delete-occurrence-carrier',
            presentationId: 'detail-occurrence-carrier',
            target: DeleteCounterTarget.make({ counterId: 'counter-1' }),
          }),
        }),
      ),
    ])
  })

  it('accepts every canonical occurrence character and maximum length', () => {
    const [model] = init()
    const symbolicFacts = InteractionInvocationFacts.make({
      ...invocationFacts,
      occurrenceId: 'actor:segment_with_symbols',
    })

    expect(
      resolveNavigationCarrier(
        model,
        '/counters/counter-1/delete',
        symbolicFacts,
      ),
    ).toStrictEqual(
      Result.succeed(
        OpenedNavigation({
          opening: DeleteCounterOpening.make({
            confirmationId: 'delete-actor:segment_with_symbols',
            presentationId: 'detail-actor:segment_with_symbols',
            target: DeleteCounterTarget.make({ counterId: 'counter-1' }),
          }),
        }),
      ),
    )

    const maximumOccurrenceId = 'o'.repeat(64)
    const maximumFacts = InteractionInvocationFacts.make({
      ...invocationFacts,
      occurrenceId: maximumOccurrenceId,
    })
    expect(
      resolveNavigationCarrier(model, '/counters/counter-1/fact', maximumFacts),
    ).toStrictEqual(
      Result.succeed(
        OpenedNavigation({
          opening: CounterFactOpening.make({
            presentationId: `detail-${maximumOccurrenceId}`,
            requestId: `fact-${maximumOccurrenceId}`,
            target: CounterFactTarget.make({ counterId: 'counter-1' }),
          }),
        }),
      ),
    )
  })

  it('round trips occurrence-derived Counter ids through canonical URIs', () => {
    const [initialModel] = init()
    const counterId = 'counter-actor:segment_with_symbols'
    const [model] = update(initialModel, ClickedAddCounter({ counterId }))
    const target = CounterDetailTarget.make({ counterId })
    const destinationUri = navigationTargetToPath(target)

    expect(destinationUri).toBe('/counters/counter-actor:segment_with_symbols')
    expect(pathToNavigationTarget(destinationUri)).toStrictEqual(target)
    expect(
      resolveNavigationCarrier(model, destinationUri, invocationFacts),
    ).toStrictEqual(
      Result.succeed(
        OpenedNavigation({
          opening: CounterDetailOpening.make({
            presentationId: 'detail-occurrence-carrier',
            target,
          }),
        }),
      ),
    )
  })

  it('rejects invalid, noncanonical, and stale destination claims distinctly', () => {
    const [model] = init()

    const overlongDestinationUri = `/${'x'.repeat(
      interactionAdmissionLimits.destinationUriLength,
    )}`
    expect(
      resolveNavigationCarrier(model, overlongDestinationUri, invocationFacts),
    ).toStrictEqual(
      Result.fail(
        new InvalidNavigationCarrierUriError({
          destinationUri: overlongDestinationUri,
        }),
      ),
    )

    expect(
      resolveNavigationCarrier(model, '/missing', invocationFacts),
    ).toStrictEqual(
      Result.fail(
        new InvalidNavigationCarrierUriError({
          destinationUri: '/missing',
        }),
      ),
    )
    expect(
      resolveNavigationCarrier(
        model,
        'https://counters.invalid/counters/counter-1',
        invocationFacts,
      ),
    ).toStrictEqual(
      Result.fail(
        new NonCanonicalNavigationCarrierUriError({
          actualDestinationUri: 'https://counters.invalid/counters/counter-1',
          expectedDestinationUri: '/counters/counter-1',
        }),
      ),
    )
    expect(
      resolveNavigationCarrier(
        model,
        '/counters/counter-stale',
        invocationFacts,
      ),
    ).toStrictEqual(
      Result.fail(
        new MissingNavigationCarrierDestinationError({
          counterId: 'counter-stale',
          destinationUri: '/counters/counter-stale',
        }),
      ),
    )
    const invalidFactsResult = resolveNavigationCarrier(model, '/counters', {
      ...invocationFacts,
      occurrenceId: 'not canonical!',
    })
    expect(Result.isFailure(invalidFactsResult)).toBe(true)
    if (Result.isFailure(invalidFactsResult)) {
      expect(invalidFactsResult.failure).toBeInstanceOf(
        InvalidNavigationCarrierInvocationFactsError,
      )
    }
  })
})
