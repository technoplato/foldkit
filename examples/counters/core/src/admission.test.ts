import { Array, Option, Result } from 'effect'
import {
  ChangedInteractionText,
  ForeignInteractionClaimProgramError,
  type InteractionAction,
  InteractionId,
  InteractionInvocationFacts,
  InteractionOccurrenceKindMismatchError,
  InteractionReference,
  InteractionSource,
  InvalidInteractionInvocationFactsError,
  MismatchedInteractionInvocationOccurrenceIdError,
  MissingInteractionReferenceError,
  StaleInteractionDestinationError,
  UnavailableInteractionError,
  interactionAdmissionLimits,
  interactiveNodes,
} from 'foldkit/interaction-graph'
import { describe, expect, it, vi } from 'vitest'

import {
  InteractionInvocation,
  InvalidMultipleCountersAdmissionClaimError,
  MultipleCountersAdmissionClaim,
  MultipleCountersMessageAdmission,
  NavigationCarrierInvocation,
  decodeMultipleCountersAdmissionClaim,
  multipleCountersAdmissionOccurrenceId,
  resolveMultipleCountersAdmissionClaim,
} from './admission.js'
import { init } from './init.js'
import {
  MultipleCountersInteractionAdmission,
  MultipleCountersInteractionGraph,
  activatedInteraction,
} from './interactionGraph.js'
import {
  ClickedAddCounter,
  ClickedDeleteCounter,
  ClickedShowCounterFact,
  ConfirmedDeleteCounter,
  DeleteCounterOpening,
  DeleteCounterTarget,
  DismissedCounterDetail,
  OpenedNavigation,
  SelectedCounter,
} from './message.js'
import type { Model } from './model.js'
import {
  InvalidNavigationCarrierUriError,
  MissingNavigationCarrierDestinationError,
  NonCanonicalNavigationCarrierUriError,
  resolveNavigationCarrier,
} from './navigationCarrier.js'
import type { Interaction } from './presentation.js'
import { update } from './update.js'

const invocationFacts = (occurrenceId: string) =>
  InteractionInvocationFacts.make({
    occurrenceId,
    actorId: 'actor-1',
    clientId: 'client-1',
    originatingProcessorId: 'processor-1',
    sessionId: 'session-1',
    subjectId: 'subject-1',
  })

const actionForToken = (
  model: Model,
  token: string,
): InteractionAction<Interaction> => {
  const projection = MultipleCountersInteractionGraph.project(model)
  if (Result.isFailure(projection)) {
    throw new Error(JSON.stringify(projection.failure, null, 2))
  }
  const maybeAction = Array.findFirst(
    interactiveNodes(projection.success.root),
    (node): node is InteractionAction<Interaction> =>
      node._tag === 'InteractionAction' &&
      node.reference.interactionId.token === token,
  )
  if (Option.isNone(maybeAction)) {
    throw new Error(`Missing interaction ${token}`)
  } else {
    return maybeAction.value
  }
}

const invocationForAction = (
  action: InteractionAction<Interaction>,
  occurrenceId: string,
): InteractionInvocation =>
  InteractionInvocation.make({
    occurrence: activatedInteraction(action.reference, occurrenceId),
  })

describe('Multiple Counters Message admission', () => {
  it('resolves valid list, detail, and modal semantic interactions', () => {
    const [listModel] = init()
    const add = actionForToken(listModel, 'AddCounter')
    const addOccurrenceId = 'occurrence-add'

    expect(
      resolveMultipleCountersAdmissionClaim(
        listModel,
        invocationForAction(add, addOccurrenceId),
        invocationFacts(addOccurrenceId),
      ),
    ).toStrictEqual(
      Result.succeed(
        ClickedAddCounter({ counterId: `counter-${addOccurrenceId}` }),
      ),
    )

    const [detailModel] = update(
      listModel,
      SelectedCounter({
        counterId: 'counter-1',
        detailPresentationId: 'detail-current',
      }),
    )
    const showFact = actionForToken(detailModel, 'ShowCounterFact')
    const factOccurrenceId = 'occurrence-fact'

    expect(
      resolveMultipleCountersAdmissionClaim(
        detailModel,
        invocationForAction(showFact, factOccurrenceId),
        invocationFacts(factOccurrenceId),
      ),
    ).toStrictEqual(
      Result.succeed(
        ClickedShowCounterFact({
          counterId: 'counter-1',
          detailPresentationId: 'detail-current',
          requestId: `fact-${factOccurrenceId}`,
        }),
      ),
    )

    const [modalModel] = update(
      detailModel,
      ClickedDeleteCounter({
        confirmationId: 'delete-current',
        counterId: 'counter-1',
        detailPresentationId: 'detail-current',
      }),
    )
    const confirmDelete = actionForToken(modalModel, 'ConfirmDeleteCounter')
    const modalOccurrenceId = 'occurrence-modal'

    expect(
      resolveMultipleCountersAdmissionClaim(
        modalModel,
        invocationForAction(confirmDelete, modalOccurrenceId),
        invocationFacts(modalOccurrenceId),
      ),
    ).toStrictEqual(
      Result.succeed(
        ConfirmedDeleteCounter({
          confirmationId: 'delete-current',
          counterId: 'counter-1',
          detailPresentationId: 'detail-current',
        }),
      ),
    )
  })

  it('resolves a canonical navigation carrier with occurrence-derived ids', () => {
    const [model] = init()
    const occurrenceId = 'occurrence-navigation'
    const claim = NavigationCarrierInvocation.make({
      destinationUri: '/counters/counter-1/delete',
      occurrenceId,
    })

    expect(
      resolveMultipleCountersAdmissionClaim(
        model,
        claim,
        invocationFacts(occurrenceId),
      ),
    ).toStrictEqual(
      Result.succeed(
        OpenedNavigation({
          opening: DeleteCounterOpening.make({
            confirmationId: `delete-${occurrenceId}`,
            presentationId: `detail-${occurrenceId}`,
            target: DeleteCounterTarget.make({ counterId: 'counter-1' }),
          }),
        }),
      ),
    )
  })

  it('rejects occurrence identities that disagree with authenticated facts', () => {
    const [model] = init()
    const authenticatedFacts = invocationFacts('occurrence-authenticated')
    const add = actionForToken(model, 'AddCounter')
    const interactionClaim = invocationForAction(
      add,
      'occurrence-interaction-claim',
    )
    const navigationClaim = NavigationCarrierInvocation.make({
      destinationUri: '/counters',
      occurrenceId: 'occurrence-navigation-claim',
    })

    expect(
      resolveMultipleCountersAdmissionClaim(
        model,
        interactionClaim,
        authenticatedFacts,
      ),
    ).toStrictEqual(
      Result.fail(
        new MismatchedInteractionInvocationOccurrenceIdError({
          authenticatedOccurrenceId: authenticatedFacts.occurrenceId,
          claimedOccurrenceId: interactionClaim.occurrence.occurrenceId,
        }),
      ),
    )
    expect(
      resolveMultipleCountersAdmissionClaim(
        model,
        navigationClaim,
        authenticatedFacts,
      ),
    ).toStrictEqual(
      Result.fail(
        new MismatchedInteractionInvocationOccurrenceIdError({
          authenticatedOccurrenceId: authenticatedFacts.occurrenceId,
          claimedOccurrenceId: navigationClaim.occurrenceId,
        }),
      ),
    )
  })

  it('propagates stale, foreign, and occurrence-kind interaction failures', () => {
    const [model] = init()
    const occurrenceId = 'occurrence-propagation'
    const facts = invocationFacts(occurrenceId)
    const add = actionForToken(model, 'AddCounter')
    const staleReference = InteractionReference.make({
      destinationUri: '/counters/counter-1',
      interactionId: add.reference.interactionId,
    })
    const foreignReference = InteractionReference.make({
      destinationUri: add.reference.destinationUri,
      interactionId: InteractionId.make({
        source: InteractionSource.make({
          programId: 'foreign-program',
          instancePath: add.reference.interactionId.source.instancePath,
        }),
        token: add.reference.interactionId.token,
      }),
    })
    const staleOccurrence = activatedInteraction(staleReference, occurrenceId)
    const foreignOccurrence = activatedInteraction(
      foreignReference,
      occurrenceId,
    )
    const wrongKindOccurrence = ChangedInteractionText.make({
      occurrenceId,
      reference: add.reference,
      value: 'unexpected',
    })
    const stale = resolveMultipleCountersAdmissionClaim(
      model,
      InteractionInvocation.make({ occurrence: staleOccurrence }),
      facts,
    )
    const foreign = resolveMultipleCountersAdmissionClaim(
      model,
      InteractionInvocation.make({ occurrence: foreignOccurrence }),
      facts,
    )
    const wrongKind = resolveMultipleCountersAdmissionClaim(
      model,
      InteractionInvocation.make({ occurrence: wrongKindOccurrence }),
      facts,
    )

    expect(stale).toStrictEqual(
      MultipleCountersInteractionAdmission.resolve(
        model,
        staleOccurrence,
        facts,
      ),
    )
    expect(foreign).toStrictEqual(
      MultipleCountersInteractionAdmission.resolve(
        model,
        foreignOccurrence,
        facts,
      ),
    )
    expect(wrongKind).toStrictEqual(
      MultipleCountersInteractionAdmission.resolve(
        model,
        wrongKindOccurrence,
        facts,
      ),
    )
    expect(Result.isFailure(stale) && stale.failure).toBeInstanceOf(
      StaleInteractionDestinationError,
    )
    expect(Result.isFailure(foreign) && foreign.failure).toBeInstanceOf(
      ForeignInteractionClaimProgramError,
    )
    expect(Result.isFailure(wrongKind) && wrongKind.failure).toBeInstanceOf(
      InteractionOccurrenceKindMismatchError,
    )
  })

  it('rejects a stale presentation reference after reopening the same destination', () => {
    const [listModel] = init()
    const [oldDetailModel] = update(
      listModel,
      SelectedCounter({
        counterId: 'counter-1',
        detailPresentationId: 'detail-old',
      }),
    )
    const oldAction = actionForToken(oldDetailModel, 'ShowCounterFact')
    const [returnedListModel] = update(
      oldDetailModel,
      DismissedCounterDetail({
        counterId: 'counter-1',
        detailPresentationId: 'detail-old',
      }),
    )
    const [newDetailModel] = update(
      returnedListModel,
      SelectedCounter({
        counterId: 'counter-1',
        detailPresentationId: 'detail-new',
      }),
    )
    const occurrenceId = 'occurrence-missing'
    const newAction = actionForToken(newDetailModel, 'ShowCounterFact')

    expect(oldAction.reference.destinationUri).toBe(
      newAction.reference.destinationUri,
    )
    expect(oldAction.reference.interactionId.token).toBe(
      newAction.reference.interactionId.token,
    )
    expect(oldAction.reference.interactionId.source).not.toStrictEqual(
      newAction.reference.interactionId.source,
    )
    const resolved = resolveMultipleCountersAdmissionClaim(
      newDetailModel,
      invocationForAction(oldAction, occurrenceId),
      invocationFacts(occurrenceId),
    )

    expect(Result.isFailure(resolved) && resolved.failure).toBeInstanceOf(
      MissingInteractionReferenceError,
    )
  })

  it('delegates interaction resolution and preserves unavailable failures', () => {
    const [model] = init()
    const occurrenceId = 'occurrence-unavailable'
    const facts = invocationFacts(occurrenceId)
    const add = actionForToken(model, 'AddCounter')
    const claim = invocationForAction(add, occurrenceId)
    const failure = new UnavailableInteractionError({
      code: 'TemporarilyUnavailable',
      reason: 'The interaction is temporarily unavailable',
      reference: add.reference,
    })
    const resolve = vi
      .spyOn(MultipleCountersInteractionAdmission, 'resolve')
      .mockReturnValue(Result.fail(failure))

    try {
      expect(
        resolveMultipleCountersAdmissionClaim(model, claim, facts),
      ).toStrictEqual(Result.fail(failure))
      expect(resolve).toHaveBeenCalledWith(model, claim.occurrence, facts)
    } finally {
      resolve.mockRestore()
    }
  })

  it('propagates noncanonical, invalid, and missing navigation URI failures', () => {
    const [model] = init()
    const occurrenceId = 'occurrence-navigation-errors'
    const facts = invocationFacts(occurrenceId)
    const noncanonicalUri = 'https://counters.invalid/counters/counter-1'
    const invalidUri = '/missing'
    const missingDestinationUri = '/counters/counter-missing'
    const resolve = (destinationUri: string) =>
      resolveMultipleCountersAdmissionClaim(
        model,
        NavigationCarrierInvocation.make({ destinationUri, occurrenceId }),
        facts,
      )
    const noncanonical = resolve(noncanonicalUri)
    const invalid = resolve(invalidUri)
    const missingDestination = resolve(missingDestinationUri)

    expect(noncanonical).toStrictEqual(
      resolveNavigationCarrier(model, noncanonicalUri, facts),
    )
    expect(invalid).toStrictEqual(
      resolveNavigationCarrier(model, invalidUri, facts),
    )
    expect(missingDestination).toStrictEqual(
      resolveNavigationCarrier(model, missingDestinationUri, facts),
    )
    expect(Result.isFailure(noncanonical)).toBe(true)
    if (Result.isFailure(noncanonical)) {
      expect(noncanonical.failure).toBeInstanceOf(
        NonCanonicalNavigationCarrierUriError,
      )
    }
    expect(Result.isFailure(invalid)).toBe(true)
    if (Result.isFailure(invalid)) {
      expect(invalid.failure).toBeInstanceOf(InvalidNavigationCarrierUriError)
    }
    expect(Result.isFailure(missingDestination)).toBe(true)
    if (Result.isFailure(missingDestination)) {
      expect(missingDestination.failure).toBeInstanceOf(
        MissingNavigationCarrierDestinationError,
      )
    }
  })

  it('strictly rejects raw Messages and excess Claim fields through the exported decoder', () => {
    const [model] = init()
    const occurrenceId = 'occurrence-strict'
    const add = actionForToken(model, 'AddCounter')
    const interactionClaim = invocationForAction(add, occurrenceId)
    const navigationClaim = NavigationCarrierInvocation.make({
      destinationUri: '/counters',
      occurrenceId,
    })
    const decodeStrictClaim = MultipleCountersMessageAdmission.decodeClaim

    expect(decodeStrictClaim(interactionClaim)).toStrictEqual(
      Result.succeed(interactionClaim),
    )
    expect(decodeStrictClaim(navigationClaim)).toStrictEqual(
      Result.succeed(navigationClaim),
    )
    expect(
      decodeStrictClaim(
        ClickedAddCounter({ counterId: 'counter-raw-message' }),
      ),
    ).toStrictEqual(
      Result.fail(expect.any(InvalidMultipleCountersAdmissionClaimError)),
    )
    expect(
      decodeStrictClaim({ ...interactionClaim, unexpected: true }),
    ).toStrictEqual(
      Result.fail(expect.any(InvalidMultipleCountersAdmissionClaimError)),
    )
    expect(
      decodeStrictClaim({
        ...interactionClaim,
        occurrence: {
          ...interactionClaim.occurrence,
          unexpected: true,
        },
      }),
    ).toStrictEqual(
      Result.fail(expect.any(InvalidMultipleCountersAdmissionClaimError)),
    )
    expect(
      decodeStrictClaim({ ...navigationClaim, unexpected: true }),
    ).toStrictEqual(
      Result.fail(expect.any(InvalidMultipleCountersAdmissionClaimError)),
    )
    expect(
      decodeStrictClaim({
        _tag: 'NavigationCarrierInvocation',
        occurrenceId,
      }),
    ).toStrictEqual(
      Result.fail(expect.any(InvalidMultipleCountersAdmissionClaimError)),
    )
    expect(() =>
      NavigationCarrierInvocation.make({
        destinationUri: '',
        occurrenceId,
      }),
    ).toThrow()

    const maximumDestinationUri = `/${'x'.repeat(
      interactionAdmissionLimits.destinationUriLength - 1,
    )}`
    expect(() =>
      NavigationCarrierInvocation.make({
        destinationUri: maximumDestinationUri,
        occurrenceId,
      }),
    ).not.toThrow()
    expect(() =>
      NavigationCarrierInvocation.make({
        destinationUri: `${maximumDestinationUri}x`,
        occurrenceId,
      }),
    ).toThrow()
  })

  it('returns typed failures for malformed invocation facts on both claim variants', () => {
    const [model] = init()
    const occurrenceId = 'occurrence-invalid-facts'
    const interactionClaim = invocationForAction(
      actionForToken(model, 'AddCounter'),
      occurrenceId,
    )
    const navigationClaim = NavigationCarrierInvocation.make({
      destinationUri: '/counters',
      occurrenceId,
    })

    const interaction = resolveMultipleCountersAdmissionClaim(
      model,
      interactionClaim,
      null,
    )
    const navigation = resolveMultipleCountersAdmissionClaim(
      model,
      navigationClaim,
      undefined,
    )

    expect(Result.isFailure(interaction) && interaction.failure).toBeInstanceOf(
      InvalidInteractionInvocationFactsError,
    )
    expect(Result.isFailure(navigation) && navigation.failure).toBeInstanceOf(
      InvalidInteractionInvocationFactsError,
    )
  })

  it('keeps Program resolution independent of non-occurrence invocation facts', () => {
    const [model] = init()
    const occurrenceId = 'occurrence-fact-independence'
    const claim = invocationForAction(
      actionForToken(model, 'AddCounter'),
      occurrenceId,
    )
    const navigationClaim = NavigationCarrierInvocation.make({
      destinationUri: '/counters/counter-1',
      occurrenceId,
    })
    const firstFacts = invocationFacts(occurrenceId)
    const secondFacts = InteractionInvocationFacts.make({
      occurrenceId,
      actorId: 'actor-2',
      clientId: 'client-2',
      originatingProcessorId: 'processor-2',
      sessionId: 'session-2',
      subjectId: 'subject-2',
    })

    expect(
      resolveMultipleCountersAdmissionClaim(model, claim, firstFacts),
    ).toStrictEqual(
      resolveMultipleCountersAdmissionClaim(model, claim, secondFacts),
    )
    expect(
      resolveMultipleCountersAdmissionClaim(model, navigationClaim, firstFacts),
    ).toStrictEqual(
      resolveMultipleCountersAdmissionClaim(
        model,
        navigationClaim,
        secondFacts,
      ),
    )
  })

  it('exposes one deterministic Program-owned definition', () => {
    const [model] = init()
    const occurrenceId = 'occurrence-deterministic'
    const facts = invocationFacts(occurrenceId)
    const interactionClaim = invocationForAction(
      actionForToken(model, 'AddCounter'),
      occurrenceId,
    )
    const navigationClaim = NavigationCarrierInvocation.make({
      destinationUri: '/counters/counter-1',
      occurrenceId,
    })

    expect(MultipleCountersMessageAdmission.Claim).toBe(
      MultipleCountersAdmissionClaim,
    )
    expect(MultipleCountersMessageAdmission.decodeClaim).toBe(
      decodeMultipleCountersAdmissionClaim,
    )
    expect(multipleCountersAdmissionOccurrenceId(interactionClaim)).toBe(
      occurrenceId,
    )
    expect(MultipleCountersMessageAdmission.occurrenceId(navigationClaim)).toBe(
      occurrenceId,
    )
    expect(
      MultipleCountersMessageAdmission.resolve(model, interactionClaim, facts),
    ).toStrictEqual(
      MultipleCountersMessageAdmission.resolve(model, interactionClaim, facts),
    )
    expect(
      MultipleCountersMessageAdmission.resolve(model, navigationClaim, facts),
    ).toStrictEqual(
      MultipleCountersMessageAdmission.resolve(model, navigationClaim, facts),
    )
  })
})
