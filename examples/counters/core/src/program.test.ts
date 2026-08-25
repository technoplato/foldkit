import * as Counter from 'counter-core-example'
import { Array, Effect, Match as M, Option, Order, Schema as S } from 'effect'
import { decodeReplayTape } from 'foldkit/program-runtime'
import { fromString } from 'foldkit/url'
import { describe, expect, it } from 'vitest'

import { counterFactForNumber } from './counterFactClient.js'
import { init } from './init.js'
import {
  CancelledDeleteCounter,
  ClickedAddCounter,
  ClickedDeleteCounter,
  ClickedShowCounterFact,
  ConfirmedDeleteCounter,
  CounterDetailOpening,
  CounterDetailTarget,
  CounterFactOpening,
  CounterFactTarget,
  CounterListOpening,
  CounterListTarget,
  DeleteCounterOpening,
  DeleteCounterTarget,
  DismissedCounterDetail,
  DismissedCounterFactAlert,
  FailedLoadCounterFact,
  type FieldOwnerMessage,
  GotChild,
  type Message,
  type NavigationTarget,
  OpenedNavigation,
  SelectedCounter,
  SucceededLoadCounterFact,
  openingForTarget,
} from './message.js'
import {
  CounterDetail,
  type CounterDetailPresentationId,
  CounterFactAlert,
  type CounterFactStatus,
  type CounterId,
  FailedCounterFact,
  LoadedCounterFact,
  LoadingCounterFact,
  Model,
  maximumCounterIdentityCount,
  projectDomain,
} from './model.js'
import {
  type Interaction,
  InteractionAnchor,
  interactionsForModel,
  messageForInteraction,
  messageForInteractionToken,
} from './presentation.js'
import { MultipleCountersProgram } from './program.js'
import {
  navigationTargetToPath,
  navigationToPath,
  pathToNavigationTarget,
  urlToNavigationTarget,
} from './route.js'
import { messageCategory, synchronization } from './synchronization.js'
import { restore, update } from './update.js'
import { EventRegistry, encodeMessage } from './wire.js'

const identitySource = {
  counterDetailPresentationId: () => 'detail-generated-1',
  counterFactRequestId: () => 'fact-generated-1',
  counterId: () => 'counter-generated-1',
  deleteCounterConfirmationId: () => 'delete-generated-1',
}

const ProjectedInteractionReference = S.Struct({
  anchor: InteractionAnchor,
  token: S.String,
})
type ProjectedInteractionReference = typeof ProjectedInteractionReference.Type

const hasSameInteractionAnchor = (
  candidate: typeof InteractionAnchor.Type,
  expected: typeof InteractionAnchor.Type,
): boolean =>
  M.value(candidate).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      CounterListAnchor: () => expected._tag === 'CounterListAnchor',
      CounterRowAnchor: ({ counterId }) =>
        expected._tag === 'CounterRowAnchor' &&
        expected.counterId === counterId,
      CounterDetailAnchor: ({ counterId, detailPresentationId }) =>
        expected._tag === 'CounterDetailAnchor' &&
        expected.counterId === counterId &&
        expected.detailPresentationId === detailPresentationId,
      CounterFactAlertAnchor: ({
        counterId,
        detailPresentationId,
        requestId,
      }) =>
        expected._tag === 'CounterFactAlertAnchor' &&
        expected.counterId === counterId &&
        expected.detailPresentationId === detailPresentationId &&
        expected.requestId === requestId,
      DeleteCounterConfirmationAnchor: ({
        confirmationId,
        counterId,
        detailPresentationId,
      }) =>
        expected._tag === 'DeleteCounterConfirmationAnchor' &&
        expected.confirmationId === confirmationId &&
        expected.counterId === counterId &&
        expected.detailPresentationId === detailPresentationId,
    }),
  )

const interactionReferenceForToken = (
  model: Model,
  token: string,
): ProjectedInteractionReference => {
  const maybeInteraction = Array.findFirst(
    interactionsForModel(model),
    interaction => interaction.token === token,
  )
  if (Option.isNone(maybeInteraction)) {
    throw new Error(`Missing projected interaction ${token}`)
  }
  return ProjectedInteractionReference.make({
    anchor: maybeInteraction.value.anchor,
    token: maybeInteraction.value.token,
  })
}

const interactionForReference = (
  model: Model,
  reference: ProjectedInteractionReference,
): Option.Option<Interaction> =>
  Array.findFirst(
    interactionsForModel(model),
    interaction =>
      interaction.token === reference.token &&
      hasSameInteractionAnchor(interaction.anchor, reference.anchor),
  )

const messageForReference = (
  model: Model,
  reference: ProjectedInteractionReference,
): Option.Option<Message> =>
  Option.map(interactionForReference(model, reference), interaction =>
    messageForInteraction(interaction, identitySource),
  )

const modelWithCounterFactStatus = (
  model: Model,
  status: CounterFactStatus,
): Model =>
  Model.make({
    ...model,
    navigation: CounterDetail.make({
      counterId: 'counter-1',
      maybeMode: Option.some(
        CounterFactAlert.make({
          requestId: 'fact-restore-1',
          status,
        }),
      ),
      presentationId: 'detail-restore-1',
    }),
  })

const selectedCounter = (
  counterId: CounterId,
  detailPresentationId: CounterDetailPresentationId,
) => SelectedCounter({ counterId, detailPresentationId })

const representativeMessages = (): ReadonlyArray<Message> => [
  ClickedAddCounter({ counterId: 'counter-3' }),
  GotChild({
    id: 'counter-1',
    message: Counter.Increment(),
  }),
  selectedCounter('counter-1', 'detail-1'),
  DismissedCounterDetail({
    counterId: 'counter-1',
    detailPresentationId: 'detail-1',
  }),
  ClickedShowCounterFact({
    counterId: 'counter-1',
    detailPresentationId: 'detail-1',
    requestId: 'fact-1',
  }),
  SucceededLoadCounterFact({
    counterId: 'counter-1',
    detailPresentationId: 'detail-1',
    fact: counterFactForNumber(0),
    requestId: 'fact-1',
  }),
  FailedLoadCounterFact({
    counterId: 'counter-1',
    detailPresentationId: 'detail-1',
    cause: 'Network',
    requestId: 'fact-1',
  }),
  DismissedCounterFactAlert({
    counterId: 'counter-1',
    detailPresentationId: 'detail-1',
    requestId: 'fact-1',
  }),
  ClickedDeleteCounter({
    confirmationId: 'delete-1',
    counterId: 'counter-1',
    detailPresentationId: 'detail-1',
  }),
  CancelledDeleteCounter({
    confirmationId: 'delete-1',
    counterId: 'counter-1',
    detailPresentationId: 'detail-1',
  }),
  ConfirmedDeleteCounter({
    confirmationId: 'delete-1',
    counterId: 'counter-1',
    detailPresentationId: 'detail-1',
  }),
  OpenedNavigation({
    opening: CounterListOpening.make({ target: CounterListTarget.make({}) }),
  }),
]

describe('Multiple Counters Program', () => {
  it('keeps fact alert and delete confirmation mutually exclusive', () => {
    const [initialModel] = init()
    const [detailModel] = update(
      initialModel,
      selectedCounter('counter-1', 'detail-1'),
    )
    const [deleteModel] = update(
      detailModel,
      ClickedDeleteCounter({
        confirmationId: 'delete-1',
        counterId: 'counter-1',
        detailPresentationId: 'detail-1',
      }),
    )
    const [unchangedModel] = update(
      deleteModel,
      ClickedShowCounterFact({
        counterId: 'counter-1',
        detailPresentationId: 'detail-1',
        requestId: 'fact-1',
      }),
    )

    expect(unchangedModel).toStrictEqual(deleteModel)
    const interactions = interactionsForModel(unchangedModel)
    expect(
      Array.map(interactions, interaction => interaction.token),
    ).toStrictEqual(['cancel', 'confirm-delete'])
    expect(
      Array.every(
        interactions,
        interaction =>
          interaction.anchor._tag === 'DeleteCounterConfirmationAnchor' &&
          interaction.anchor.counterId === 'counter-1' &&
          interaction.anchor.detailPresentationId === 'detail-1' &&
          interaction.anchor.confirmationId === 'delete-1',
      ),
    ).toBe(true)
  })

  it('routes each child Message to the identified Counter Submodel', () => {
    const [initialModel] = init()
    const [nextModel] = MultipleCountersProgram.update(
      initialModel,
      GotChild({
        id: 'counter-2',
        message: Counter.Increment(),
      }),
    )
    const maybeFirst = Array.findFirst(
      nextModel.rows,
      row => row.id === 'counter-1',
    )
    const maybeSecond = Array.findFirst(
      nextModel.rows,
      row => row.id === 'counter-2',
    )

    expect(Option.map(maybeFirst, row => row.child.count)).toStrictEqual(
      Option.some(0),
    )
    expect(Option.map(maybeSecond, row => row.child.count)).toStrictEqual(
      Option.some(1),
    )
  })

  it('schedules a fact Command and records the result as a Message', () => {
    const [initialModel] = init()
    const [detailModel] = update(
      initialModel,
      selectedCounter('counter-1', 'detail-1'),
    )
    const [loadingModel, commands] = update(
      detailModel,
      ClickedShowCounterFact({
        counterId: 'counter-1',
        detailPresentationId: 'detail-1',
        requestId: 'fact-1',
      }),
    )
    const [factModel, resultCommands] = update(
      loadingModel,
      SucceededLoadCounterFact({
        counterId: 'counter-1',
        detailPresentationId: 'detail-1',
        fact: counterFactForNumber(0),
        requestId: 'fact-1',
      }),
    )

    expect(Array.map(commands, command => command.name)).toStrictEqual([
      'FetchCounterFact',
    ])
    expect(resultCommands).toStrictEqual([])
    expect(loadingModel.navigation).toMatchObject({
      _tag: 'CounterDetail',
      counterId: 'counter-1',
      presentationId: 'detail-1',
      maybeMode: {
        _tag: 'Some',
        value: {
          _tag: 'CounterFactAlert',
          requestId: 'fact-1',
          status: { _tag: 'LoadingCounterFact' },
        },
      },
    })
    expect(factModel.navigation).toMatchObject({
      _tag: 'CounterDetail',
      maybeMode: {
        _tag: 'Some',
        value: {
          _tag: 'CounterFactAlert',
          status: {
            _tag: 'LoadedCounterFact',
            fact: { number: 0 },
          },
        },
      },
    })
  })

  it('restores an in-flight fact by scheduling the Command again', () => {
    const [initialModel] = init()
    const ModelJson = S.toCodecJson(Model)
    const decodePersistedModel = (model: Model): Model =>
      S.decodeUnknownSync(ModelJson)(S.encodeSync(ModelJson)(model))
    const loadingModel = decodePersistedModel(
      modelWithCounterFactStatus(initialModel, LoadingCounterFact.make({})),
    )
    const failedModel = decodePersistedModel(
      modelWithCounterFactStatus(
        initialModel,
        FailedCounterFact.make({ cause: 'Network' }),
      ),
    )
    const loadedModel = decodePersistedModel(
      modelWithCounterFactStatus(
        initialModel,
        LoadedCounterFact.make({ fact: counterFactForNumber(0) }),
      ),
    )

    const [restoredLoadingModel, loadingCommands] = restore(loadingModel)
    const [restoredFailedModel, failedCommands] = restore(failedModel)
    const [restoredLoadedModel, loadedCommands] = restore(loadedModel)

    expect(restoredLoadingModel.navigation).toMatchObject({
      _tag: 'CounterDetail',
      maybeMode: {
        _tag: 'Some',
        value: {
          _tag: 'CounterFactAlert',
          status: { _tag: 'LoadingCounterFact' },
        },
      },
    })
    expect(Array.map(loadingCommands, command => command.name)).toStrictEqual([
      'FetchCounterFact',
    ])
    expect(restoredFailedModel.navigation).toStrictEqual(failedModel.navigation)
    expect(restoredLoadedModel).toStrictEqual(loadedModel)
    expect(projectDomain(restoredLoadingModel)).toStrictEqual(
      projectDomain(loadingModel),
    )
    expect(projectDomain(restoredFailedModel)).toStrictEqual(
      projectDomain(failedModel),
    )
    expect(projectDomain(restoredLoadedModel)).toStrictEqual(
      projectDomain(loadedModel),
    )
    expect(failedCommands).toStrictEqual([])
    expect(loadedCommands).toStrictEqual([])
  })

  it('keeps transient detail and modal identities out of semantic URIs', () => {
    const maybeUrl = fromString('https://example.test/counters/counter-2/fact')
    if (Option.isNone(maybeUrl)) {
      throw new Error('Expected a valid URL')
    }

    const target = urlToNavigationTarget(maybeUrl.value)
    const opening = openingForTarget(target, identitySource)
    const [initialModel] = init()
    const [nextModel] = update(initialModel, OpenedNavigation({ opening }))

    expect(navigationTargetToPath(target)).toBe('/counters/counter-2/fact')
    expect(target).toStrictEqual(
      CounterFactTarget.make({ counterId: 'counter-2' }),
    )
    expect(target).not.toHaveProperty('presentationId')
    expect(target).not.toHaveProperty('requestId')
    expect(navigationToPath(nextModel.navigation)).toBe(
      '/counters/counter-2/fact',
    )
    expect(nextModel.navigation).toMatchObject({
      presentationId: 'detail-generated-1',
      maybeMode: {
        value: {
          requestId: 'fact-generated-1',
        },
      },
    })
  })

  it('parses the same portable route through relative and host carriers', () => {
    const relativeTarget = pathToNavigationTarget('/counters/counter-2/delete')
    const nativeTarget = pathToNavigationTarget(
      'foldkit://showcase/counters/counter-2/delete',
    )

    expect(navigationTargetToPath(relativeTarget)).toBe(
      '/counters/counter-2/delete',
    )
    expect(navigationTargetToPath(nativeTarget)).toBe(
      '/counters/counter-2/delete',
    )
    expect(relativeTarget).not.toHaveProperty('presentationId')
    expect(relativeTarget).not.toHaveProperty('confirmationId')
  })

  it('round trips and canonicalizes every semantic navigation target', () => {
    const cases: ReadonlyArray<readonly [NavigationTarget, string]> = [
      [CounterListTarget.make({}), '/counters'],
      [
        CounterDetailTarget.make({ counterId: 'counter-2' }),
        '/counters/counter-2',
      ],
      [
        CounterFactTarget.make({ counterId: 'counter-2' }),
        '/counters/counter-2/fact',
      ],
      [
        DeleteCounterTarget.make({ counterId: 'counter-2' }),
        '/counters/counter-2/delete',
      ],
    ]

    for (const [target, canonicalPath] of cases) {
      const printedPath = navigationTargetToPath(target)
      const parsedTarget = pathToNavigationTarget(printedPath)
      const hostTarget = pathToNavigationTarget(
        `https://example.test${printedPath}?presenter=a#current`,
      )
      const nativeTarget = pathToNavigationTarget(
        `foldkit://showcase${printedPath}?presenter=b#current`,
      )

      expect(printedPath).toBe(canonicalPath)
      expect(parsedTarget).toStrictEqual(target)
      expect(hostTarget).toStrictEqual(target)
      expect(nativeTarget).toStrictEqual(target)
      expect(navigationTargetToPath(parsedTarget)).toBe(canonicalPath)
      expect(navigationTargetToPath(hostTarget)).toBe(canonicalPath)
      expect(navigationTargetToPath(nativeTarget)).toBe(canonicalPath)
    }
  })

  it('treats scheme text in a relative query or hash as relative data', () => {
    const target = pathToNavigationTarget(
      '/counters/counter-2/fact?return=https://example.test/counters#next=foldkit://showcase/counters',
    )

    expect(target).toStrictEqual(
      CounterFactTarget.make({ counterId: 'counter-2' }),
    )
    expect(navigationTargetToPath(target)).toBe('/counters/counter-2/fact')
  })

  it('uses explicit stable Counter ids and ignores duplicate creation', () => {
    const [initialModel] = init()
    const message = ClickedAddCounter({ counterId: 'counter-created-1' })
    const [createdModel] = update(initialModel, message)
    const [duplicateModel] = update(createdModel, message)

    expect(Array.map(createdModel.rows, row => row.id)).toContain(
      'counter-created-1',
    )
    expect(duplicateModel).toStrictEqual(createdModel)
  })

  it('retires deleted Counter ids and rejects stale domain Messages', () => {
    const [initialModel] = init()
    const deleteMessage = ConfirmedDeleteCounter({
      confirmationId: 'delete-old-1',
      counterId: 'counter-1',
      detailPresentationId: 'detail-old-1',
    })
    const [deletedModel] = update(initialModel, deleteMessage)
    const [recreatedModel] = update(
      deletedModel,
      ClickedAddCounter({ counterId: 'counter-1' }),
    )
    const [staleCounterMessageModel] = MultipleCountersProgram.update(
      recreatedModel,
      GotChild({
        id: 'counter-1',
        message: Counter.Increment(),
      }),
    )
    const [staleDeleteModel] = update(staleCounterMessageModel, deleteMessage)
    const [missingDeleteModel] = update(
      staleDeleteModel,
      ConfirmedDeleteCounter({
        confirmationId: 'delete-missing-1',
        counterId: 'counter-missing-1',
        detailPresentationId: 'detail-missing-1',
      }),
    )

    expect(deletedModel.retiredCounterIds).toStrictEqual(['counter-1'])
    expect(Array.map(deletedModel.rows, row => row.id)).not.toContain(
      'counter-1',
    )
    expect(recreatedModel).toStrictEqual(deletedModel)
    expect(staleCounterMessageModel).toStrictEqual(deletedModel)
    expect(staleDeleteModel).toStrictEqual(deletedModel)
    expect(missingDeleteModel).toStrictEqual(deletedModel)
  })

  it('enforces bounded and correlated identity ownership through Schema', () => {
    const [initialModel] = init()
    const tooManyRetiredCounterIds = Array.makeBy(
      maximumCounterIdentityCount + 1,
      index => `counter-retired-${index.toString()}`,
    )

    expect(() =>
      S.decodeUnknownSync(Model)({
        ...initialModel,
        retiredCounterIds: ['counter-1'],
      }),
    ).toThrow()
    expect(() =>
      S.decodeUnknownSync(Model)({
        ...initialModel,
        retiredCounterIds: tooManyRetiredCounterIds,
      }),
    ).toThrow()
    expect(() =>
      S.decodeUnknownSync(Model)({
        ...initialModel,
        navigation: {
          _tag: 'CounterDetail',
          counterId: 'counter-1',
          maybeMode: {
            _tag: 'CounterFactAlert',
            requestId: 'fact-1',
            status: {
              _tag: 'LoadedCounterFact',
              fact: { number: 0, text: 'Zero' },
            },
          },
          presentationId: 'detail-new-1',
        },
      }),
    ).toThrow()
  })

  it('requires detail navigation to name an active Counter through Schema', () => {
    const [initialModel] = init()
    const encodedInitialModel = S.encodeSync(Model)(initialModel)
    const activeDetail = {
      _tag: 'CounterDetail',
      counterId: 'counter-1',
      maybeMode: Option.none(),
      presentationId: 'detail-active-1',
    }
    const activeModel = S.decodeUnknownSync(Model)({
      ...encodedInitialModel,
      navigation: activeDetail,
    })
    const missingDetail = {
      ...activeDetail,
      counterId: 'counter-missing-1',
      presentationId: 'detail-missing-1',
    }
    const retiredDetail = {
      ...activeDetail,
      presentationId: 'detail-retired-1',
    }

    expect(activeModel.navigation).toStrictEqual(
      CounterDetail.make({
        counterId: 'counter-1',
        maybeMode: Option.none(),
        presentationId: 'detail-active-1',
      }),
    )
    expect(() =>
      S.decodeUnknownSync(Model)({
        ...encodedInitialModel,
        navigation: missingDetail,
      }),
    ).toThrow()
    expect(() =>
      S.decodeUnknownSync(Model)({
        ...encodedInitialModel,
        retiredCounterIds: ['counter-1'],
        rows: Array.filter(
          encodedInitialModel.rows,
          row => row.id !== 'counter-1',
        ),
        navigation: retiredDetail,
      }),
    ).toThrow()
  })

  it('rejects delayed callbacks from replaced detail and modal occurrences', () => {
    const [initialModel] = init()
    const [oldDetailModel] = update(
      initialModel,
      selectedCounter('counter-1', 'detail-old-1'),
    )
    const [listModel] = update(
      oldDetailModel,
      DismissedCounterDetail({
        counterId: 'counter-1',
        detailPresentationId: 'detail-old-1',
      }),
    )
    const [newDetailModel] = update(
      listModel,
      selectedCounter('counter-1', 'detail-new-1'),
    )
    const [staleDetailDismissal] = update(
      newDetailModel,
      DismissedCounterDetail({
        counterId: 'counter-1',
        detailPresentationId: 'detail-old-1',
      }),
    )
    const [factModel] = update(
      newDetailModel,
      ClickedShowCounterFact({
        counterId: 'counter-1',
        detailPresentationId: 'detail-new-1',
        requestId: 'fact-current-1',
      }),
    )
    const [staleFactDismissal] = update(
      factModel,
      DismissedCounterFactAlert({
        counterId: 'counter-1',
        detailPresentationId: 'detail-old-1',
        requestId: 'fact-current-1',
      }),
    )
    const [deleteModel] = update(
      newDetailModel,
      ClickedDeleteCounter({
        confirmationId: 'delete-current-1',
        counterId: 'counter-1',
        detailPresentationId: 'detail-new-1',
      }),
    )
    const [staleDeleteCancellation] = update(
      deleteModel,
      CancelledDeleteCounter({
        confirmationId: 'delete-current-1',
        counterId: 'counter-1',
        detailPresentationId: 'detail-old-1',
      }),
    )

    expect(staleDetailDismissal).toStrictEqual(newDetailModel)
    expect(staleFactDismissal).toStrictEqual(factModel)
    expect(staleDeleteCancellation).toStrictEqual(deleteModel)
  })

  it('cannot resolve a stale confirm-delete interaction after cancellation or replacement', () => {
    const [initialModel] = init()
    const [detailModel] = update(
      initialModel,
      selectedCounter('counter-1', 'detail-1'),
    )
    const [oldDeleteModel] = update(
      detailModel,
      ClickedDeleteCounter({
        confirmationId: 'delete-old-1',
        counterId: 'counter-1',
        detailPresentationId: 'detail-1',
      }),
    )
    const oldReference = interactionReferenceForToken(
      oldDeleteModel,
      'confirm-delete',
    )
    const oldMessage = messageForReference(oldDeleteModel, oldReference)
    const [cancelledModel] = update(
      oldDeleteModel,
      CancelledDeleteCounter({
        confirmationId: 'delete-old-1',
        counterId: 'counter-1',
        detailPresentationId: 'detail-1',
      }),
    )
    const [newDeleteModel] = update(
      cancelledModel,
      ClickedDeleteCounter({
        confirmationId: 'delete-new-1',
        counterId: 'counter-1',
        detailPresentationId: 'detail-1',
      }),
    )
    const newReference = interactionReferenceForToken(
      newDeleteModel,
      'confirm-delete',
    )

    expect(oldMessage).toStrictEqual(
      Option.some(
        ConfirmedDeleteCounter({
          confirmationId: 'delete-old-1',
          counterId: 'counter-1',
          detailPresentationId: 'detail-1',
        }),
      ),
    )
    expect(interactionForReference(cancelledModel, oldReference)).toStrictEqual(
      Option.none(),
    )
    expect(interactionForReference(newDeleteModel, oldReference)).toStrictEqual(
      Option.none(),
    )
    expect(messageForReference(newDeleteModel, newReference)).toStrictEqual(
      Option.some(
        ConfirmedDeleteCounter({
          confirmationId: 'delete-new-1',
          counterId: 'counter-1',
          detailPresentationId: 'detail-1',
        }),
      ),
    )

    if (Option.isNone(oldMessage)) {
      throw new Error('Expected the original accepted Domain Message')
    }
    const [replayedModel, commands] = MultipleCountersProgram.update(
      cancelledModel,
      oldMessage.value,
    )
    expect(messageCategory(oldMessage.value)).toBe('Domain')
    expect(replayedModel.retiredCounterIds).toContain('counter-1')
    expect(replayedModel.navigation._tag).toBe('CounterList')
    expect(commands).toStrictEqual([])
  })

  it('applies duplicate CounterList openings idempotently without Commands', () => {
    const [initialModel] = init()
    const [detailModel] = update(
      initialModel,
      selectedCounter('counter-1', 'detail-list-1'),
    )
    const message = OpenedNavigation({
      opening: CounterListOpening.make({ target: CounterListTarget.make({}) }),
    })
    const [listModel, firstCommands] = update(detailModel, message)
    const [duplicateModel, duplicateCommands] = update(listModel, message)

    expect(listModel.navigation._tag).toBe('CounterList')
    expect(duplicateModel).toStrictEqual(listModel)
    expect(firstCommands).toStrictEqual([])
    expect(duplicateCommands).toStrictEqual([])
  })

  it('anchors row interactions at stable semantic Counter sources', () => {
    const [initialModel] = init()
    const firstRowInteractions = Array.filter(
      interactionsForModel(initialModel),
      interaction =>
        interaction.anchor._tag === 'CounterRowAnchor' &&
        interaction.anchor.counterId === 'counter-1',
    )
    const [incrementedModel] = MultipleCountersProgram.update(
      initialModel,
      GotChild({
        id: 'counter-1',
        message: Counter.Increment(),
      }),
    )
    const nextFirstRowInteractions = Array.filter(
      interactionsForModel(incrementedModel),
      interaction =>
        interaction.anchor._tag === 'CounterRowAnchor' &&
        interaction.anchor.counterId === 'counter-1',
    )

    expect(
      Array.map(firstRowInteractions, interaction => interaction.token),
    ).toStrictEqual([
      'open:counter-1',
      'decrement:counter-1',
      'increment:counter-1',
      'delete:counter-1',
    ])
    expect(
      Array.map(nextFirstRowInteractions, interaction => interaction.token),
    ).toStrictEqual(
      Array.map(firstRowInteractions, interaction => interaction.token),
    )
    const tokens = Array.map(
      firstRowInteractions,
      interaction => interaction.token,
    )
    expect(tokens).not.toContain('d')
    expect(tokens).not.toContain('x')
    expect(tokens.join(':')).not.toContain('Key')
  })

  it('allocates interaction identities only when resolving an invocation', () => {
    const [initialModel] = init()

    expect(
      messageForInteractionToken(initialModel, 'add', identitySource),
    ).toStrictEqual(
      Option.some(ClickedAddCounter({ counterId: 'counter-generated-1' })),
    )
    expect(
      messageForInteractionToken(
        initialModel,
        'open:counter-1',
        identitySource,
      ),
    ).toStrictEqual(
      Option.some(selectedCounter('counter-1', 'detail-generated-1')),
    )
    expect(
      messageForInteractionToken(
        initialModel,
        'delete:counter-1',
        identitySource,
      ),
    ).toStrictEqual(
      Option.some(
        ClickedDeleteCounter({
          confirmationId: 'delete-generated-1',
          counterId: 'counter-1',
          detailPresentationId: 'detail-generated-1',
        }),
      ),
    )
  })

  it('classifies every current Message and registers every wire family', () => {
    const messages = representativeMessages()
    const encodedEvents = Array.map(messages, encodeMessage)
    const registeredEventIds = Array.sort(
      Array.map(EventRegistry.families, family => family.eventId),
      Order.String,
    )
    const encodedEventIds = Array.sort(
      Array.map(encodedEvents, event => event.eventId),
      Order.String,
    )

    expect(Array.map(messages, messageCategory)).toStrictEqual([
      'Domain',
      'Domain',
      'Navigation',
      'Navigation',
      'Navigation',
      'Navigation',
      'Navigation',
      'Navigation',
      'Navigation',
      'Navigation',
      'Domain',
      'Navigation',
    ])
    expect(registeredEventIds).toStrictEqual(encodedEventIds)
    expect(Array.every(encodedEvents, event => event.eventVersion === 1)).toBe(
      true,
    )
    for (const [message, encodedEvent] of Array.zip(messages, encodedEvents)) {
      const maybeFamily = Array.findFirst(
        EventRegistry.families,
        family => family.eventId === encodedEvent.eventId,
      )
      if (Option.isNone(maybeFamily)) {
        throw new Error(`Missing family ${encodedEvent.eventId}`)
      }
      expect(
        Effect.runSync(maybeFamily.value.decodeCurrent(encodedEvent.payload)),
      ).toStrictEqual(message)
    }
    expect(EventRegistry.currentProgramVersion).toBe(3)
    expect(EventRegistry.programId).toBe(MultipleCountersProgram.id)
    expect(MultipleCountersProgram.version).toBe(3)
    expect(MultipleCountersProgram.versionedEvents).toBe(EventRegistry)
    expect(MultipleCountersProgram.synchronization).toBe(synchronization)
  })

  it('rejects v1 replay tapes at the intentional v2 compatibility cut', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        decodeReplayTape(
          MultipleCountersProgram,
          JSON.stringify({
            formatVersion: 1,
            programId: 'multiple-counters',
            programVersion: 1,
          }),
        ),
      ),
    )

    expect(MultipleCountersProgram.migrations).toStrictEqual([])
    expect(error).toMatchObject({
      _tag: 'IncompatibleProgramVersionError',
      actualVersion: 1,
      expectedVersion: 3,
      programId: 'multiple-counters',
    })
  })

  it('never changes projected domain for Navigation Messages', () => {
    const [initialModel] = init()
    const [detailModel] = update(
      initialModel,
      selectedCounter('counter-1', 'detail-1'),
    )
    const [factModel] = update(
      detailModel,
      ClickedShowCounterFact({
        counterId: 'counter-1',
        detailPresentationId: 'detail-1',
        requestId: 'fact-1',
      }),
    )
    const [deleteModel] = update(
      detailModel,
      ClickedDeleteCounter({
        confirmationId: 'delete-1',
        counterId: 'counter-1',
        detailPresentationId: 'detail-1',
      }),
    )
    const cases: ReadonlyArray<
      readonly [typeof initialModel, FieldOwnerMessage]
    > = [
      [initialModel, selectedCounter('counter-1', 'detail-1')],
      [
        detailModel,
        DismissedCounterDetail({
          counterId: 'counter-1',
          detailPresentationId: 'detail-1',
        }),
      ],
      [
        detailModel,
        ClickedShowCounterFact({
          counterId: 'counter-1',
          detailPresentationId: 'detail-1',
          requestId: 'fact-1',
        }),
      ],
      [
        factModel,
        DismissedCounterFactAlert({
          counterId: 'counter-1',
          detailPresentationId: 'detail-1',
          requestId: 'fact-1',
        }),
      ],
      [
        initialModel,
        ClickedDeleteCounter({
          confirmationId: 'delete-list-1',
          counterId: 'counter-1',
          detailPresentationId: 'detail-list-1',
        }),
      ],
      [
        deleteModel,
        CancelledDeleteCounter({
          confirmationId: 'delete-1',
          counterId: 'counter-1',
          detailPresentationId: 'detail-1',
        }),
      ],
      [
        initialModel,
        OpenedNavigation({
          opening: CounterDetailOpening.make({
            presentationId: 'detail-route-1',
            target: CounterDetailTarget.make({ counterId: 'counter-2' }),
          }),
        }),
      ],
      [
        initialModel,
        OpenedNavigation({
          opening: CounterFactOpening.make({
            presentationId: 'detail-route-2',
            requestId: 'fact-route-1',
            target: CounterFactTarget.make({ counterId: 'counter-2' }),
          }),
        }),
      ],
      [
        initialModel,
        OpenedNavigation({
          opening: DeleteCounterOpening.make({
            confirmationId: 'delete-route-1',
            presentationId: 'detail-route-3',
            target: DeleteCounterTarget.make({ counterId: 'counter-2' }),
          }),
        }),
      ],
    ]

    for (const [model, message] of cases) {
      const [nextModel] = update(model, message)
      expect(messageCategory(message)).toBe('Navigation')
      expect(projectDomain(nextModel)).toStrictEqual(projectDomain(model))
    }
  })

  it('applies Domain Messages identically across divergent navigation', () => {
    const [listModel] = init()
    const [counterOneDetailModel] = update(
      listModel,
      selectedCounter('counter-1', 'detail-1'),
    )
    const [counterTwoDetailModel] = update(
      listModel,
      selectedCounter('counter-2', 'detail-2'),
    )
    const [counterTwoFactModel] = update(
      counterTwoDetailModel,
      ClickedShowCounterFact({
        counterId: 'counter-2',
        detailPresentationId: 'detail-2',
        requestId: 'fact-2',
      }),
    )
    const domainMessages: ReadonlyArray<Message> = [
      GotChild({
        id: 'counter-1',
        message: Counter.Increment(),
      }),
      ClickedAddCounter({ counterId: 'counter-3' }),
      ConfirmedDeleteCounter({
        confirmationId: 'delete-1',
        counterId: 'counter-1',
        detailPresentationId: 'detail-1',
      }),
    ]

    const finalModels = Array.reduce(
      domainMessages,
      {
        first: listModel,
        second: counterTwoFactModel,
        third: counterOneDetailModel,
      },
      (models, message) => {
        const [nextFirst] = MultipleCountersProgram.update(
          models.first,
          message,
        )
        const [nextSecond] = MultipleCountersProgram.update(
          models.second,
          message,
        )
        const [nextThird] = MultipleCountersProgram.update(
          models.third,
          message,
        )
        expect(messageCategory(message)).toBe('Domain')
        expect(projectDomain(nextFirst)).toStrictEqual(
          projectDomain(nextSecond),
        )
        expect(projectDomain(nextFirst)).toStrictEqual(projectDomain(nextThird))
        return { first: nextFirst, second: nextSecond, third: nextThird }
      },
    )

    expect(finalModels.first.retiredCounterIds).toStrictEqual(['counter-1'])
    expect(finalModels.first.navigation._tag).toBe('CounterList')
    expect(navigationToPath(finalModels.second.navigation)).toBe(
      '/counters/counter-2/fact',
    )
    expect(finalModels.third.navigation._tag).toBe('CounterList')
  })
})
