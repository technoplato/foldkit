import * as Counter from 'counter-core-example'
import { Array, Option, Result } from 'effect'
import {
  type InteractionAction,
  type InteractionProjection,
  InteractionReference,
  interactionIdKey,
  interactionNodes,
  interactiveNodes,
} from 'foldkit/interaction-graph'
import { describe, expect, it } from 'vitest'

import { init } from './init.js'
import {
  MultipleCountersInteractionGraph,
  activatedInteraction,
  interactionProjectionForModel,
} from './interactionGraph.js'
import {
  CancelledDeleteCounter,
  ClickedAddCounter,
  ClickedDeleteCounter,
  ConfirmedDeleteCounter,
  GotCounterMessage,
  SelectedCounter,
} from './message.js'
import { type Model } from './model.js'
import {
  type Interaction,
  type InteractionIdentitySource,
} from './presentation.js'
import { update } from './update.js'

const identitySource: InteractionIdentitySource = {
  counterDetailPresentationId: () => 'detail-generated-1',
  counterFactRequestId: () => 'fact-generated-1',
  counterId: () => 'counter-generated-1',
  deleteCounterConfirmationId: () => 'delete-generated-1',
}

const projectionSuccess = (
  model: Model,
): InteractionProjection<Interaction> => {
  const result = MultipleCountersInteractionGraph.project(model)
  if (Result.isFailure(result)) {
    throw new Error(JSON.stringify(result.failure, null, 2))
  }
  return result.success
}

const actionForToken = (
  projection: InteractionProjection<Interaction>,
  token: string,
): InteractionAction<Interaction> => {
  const maybeAction = Array.findFirst(
    interactiveNodes(projection.root),
    (node): node is InteractionAction<Interaction> =>
      node._tag === 'InteractionAction' &&
      node.reference.interactionId.token === token,
  )
  if (Option.isNone(maybeAction)) {
    throw new Error(`Missing interaction ${token}`)
  }
  return maybeAction.value
}

const resolvedMessage = (
  model: Model,
  action: InteractionAction<Interaction>,
) => {
  const result = MultipleCountersInteractionGraph.resolve(
    model,
    activatedInteraction(action.reference, 'occurrence-test'),
    identitySource,
  )
  if (Result.isFailure(result)) {
    throw new Error(JSON.stringify(result.failure, null, 2))
  }
  return result.success
}

describe('Multiple Counters InteractionGraph', () => {
  it('projects list actions beside ordered stable Counter Submodel sources', () => {
    const [model] = init()
    const projection = projectionSuccess(model)

    expect(projection.destinationUri).toBe('/counters')
    expect(
      Array.map(projection.root.children, child => child._tag),
    ).toStrictEqual([
      'InteractionAction',
      'InteractionGroup',
      'InteractionGroup',
    ])
    expect(
      Array.map(
        Array.filter(
          interactionNodes(projection.root),
          node => node._tag === 'InteractionGroup',
        ),
        node => node.label,
      ),
    ).toStrictEqual(['Counters', 'counter-1', 'counter-2'])
    expect(
      Array.map(interactiveNodes(projection.root), node =>
        node._tag === 'InteractionAction'
          ? node.reference.interactionId.token
          : node._tag,
      ),
    ).toStrictEqual([
      'AddCounter',
      'OpenCounter',
      'DecrementCounter',
      'IncrementCounter',
      'DeleteCounter',
      'OpenCounter',
      'DecrementCounter',
      'IncrementCounter',
      'DeleteCounter',
    ])
  })

  it('keeps row semantic ids stable across count changes without array positions', () => {
    const [model] = init()
    const before = actionForToken(projectionSuccess(model), 'IncrementCounter')
    const [nextModel] = update(
      model,
      GotCounterMessage({
        counterId: 'counter-1',
        message: Counter.ClickedIncrement(),
      }),
    )
    const after = actionForToken(
      projectionSuccess(nextModel),
      'IncrementCounter',
    )

    expect(interactionIdKey(before.reference.interactionId)).toBe(
      interactionIdKey(after.reference.interactionId),
    )
    expect(before.reference.interactionId.source.instancePath).toStrictEqual([
      { submodelId: 'Counter', instanceId: 'counter-1' },
    ])
  })

  it('keeps Counter-owned action ids stable across list and detail placement', () => {
    const [listModel] = init()
    const listIncrement = actionForToken(
      projectionSuccess(listModel),
      'IncrementCounter',
    )
    const [detailModel] = update(
      listModel,
      SelectedCounter({
        counterId: 'counter-1',
        detailPresentationId: 'detail-1',
      }),
    )
    const detailIncrement = actionForToken(
      projectionSuccess(detailModel),
      'IncrementCounter',
    )

    expect(interactionIdKey(listIncrement.reference.interactionId)).toBe(
      interactionIdKey(detailIncrement.reference.interactionId),
    )
    expect(listIncrement.reference.destinationUri).not.toBe(
      detailIncrement.reference.destinationUri,
    )
    expect(
      detailIncrement.reference.interactionId.source.instancePath,
    ).toStrictEqual([{ submodelId: 'Counter', instanceId: 'counter-1' }])
  })

  it('allocates fresh ids only while resolving a typed occurrence', () => {
    const [model] = init()
    const projection = interactionProjectionForModel(model)
    const add = actionForToken(projection, 'AddCounter')
    const open = actionForToken(projection, 'OpenCounter')

    expect(resolvedMessage(model, add)).toStrictEqual(
      Option.some(ClickedAddCounter({ counterId: 'counter-generated-1' })),
    )
    expect(resolvedMessage(model, open)).toStrictEqual(
      Option.some(
        SelectedCounter({
          counterId: 'counter-1',
          detailPresentationId: 'detail-generated-1',
        }),
      ),
    )
  })

  it('opens the selected list-row delete confirmation with generated ids', () => {
    const [model] = init()
    const rowDelete = actionForToken(projectionSuccess(model), 'DeleteCounter')
    const maybeMessage = resolvedMessage(model, rowDelete)
    if (Option.isNone(maybeMessage)) {
      throw new Error('Expected row delete to resolve')
    }
    const [nextModel] = update(model, maybeMessage.value)

    expect(nextModel.rows).toStrictEqual(model.rows)
    expect(nextModel.navigation).toMatchObject({
      _tag: 'CounterDetail',
      counterId: 'counter-1',
      presentationId: 'detail-generated-1',
      maybeMode: {
        _tag: 'Some',
        value: {
          _tag: 'DeleteCounterConfirmation',
          confirmationId: 'delete-generated-1',
          detailPresentationId: 'detail-generated-1',
        },
      },
    })
  })

  it('rejects a same-URI confirmation claim from a replaced modal occurrence', () => {
    const [model] = init()
    const [detailModel] = update(
      model,
      SelectedCounter({
        counterId: 'counter-1',
        detailPresentationId: 'detail-1',
      }),
    )
    const [oldDeleteModel] = update(
      detailModel,
      ClickedDeleteCounter({
        confirmationId: 'delete-old-1',
        counterId: 'counter-1',
        detailPresentationId: 'detail-1',
      }),
    )
    const oldConfirm = actionForToken(
      projectionSuccess(oldDeleteModel),
      'ConfirmDeleteCounter',
    )
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
    const currentProjection = projectionSuccess(newDeleteModel)
    const currentConfirm = actionForToken(
      currentProjection,
      'ConfirmDeleteCounter',
    )
    const staleResult = MultipleCountersInteractionGraph.resolve(
      newDeleteModel,
      activatedInteraction(oldConfirm.reference, 'occurrence-stale'),
      identitySource,
    )

    expect(oldConfirm.reference.destinationUri).toBe(
      currentConfirm.reference.destinationUri,
    )
    expect(interactionIdKey(oldConfirm.reference.interactionId)).not.toBe(
      interactionIdKey(currentConfirm.reference.interactionId),
    )
    expect(Result.isSuccess(staleResult)).toBe(true)
    if (Result.isSuccess(staleResult)) {
      expect(staleResult.success).toStrictEqual(Option.none())
    }
    expect(resolvedMessage(newDeleteModel, currentConfirm)).toStrictEqual(
      Option.some(
        ConfirmedDeleteCounter({
          confirmationId: 'delete-new-1',
          counterId: 'counter-1',
          detailPresentationId: 'detail-1',
        }),
      ),
    )
  })

  it('rejects a valid structural identity wrapped in the wrong URI', () => {
    const [model] = init()
    const add = actionForToken(projectionSuccess(model), 'AddCounter')
    const wrongReference = InteractionReference.make({
      destinationUri: '/counters/counter-1',
      interactionId: add.reference.interactionId,
    })
    const result = MultipleCountersInteractionGraph.resolve(
      model,
      activatedInteraction(wrongReference, 'occurrence-wrong-uri'),
      identitySource,
    )

    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isSuccess(result)) {
      expect(result.success).toStrictEqual(Option.none())
    }
  })
})
