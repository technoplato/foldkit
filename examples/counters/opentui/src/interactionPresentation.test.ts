import {
  SelectedCounter,
  init,
  interactionProjectionForModel,
  update,
} from 'counters-core-example'
import { Array, Option } from 'effect'
import * as InteractionGraph from 'foldkit/interaction-graph'
import { describe, expect, it } from 'vitest'

import { normalizeInput } from './input.js'
import {
  availableSemanticShortcutLabels,
  formatInteractionProjection,
  movedSourceReference,
  referenceForSemanticInteraction,
  scrollTopForFocusedBounds,
  sourcePrimaryReferences,
} from './interactionPresentation.js'

const reference = (
  counterId: string,
  token: string,
): InteractionGraph.InteractionReference => ({
  destinationUri: '/counters',
  interactionId: {
    source: {
      programId: 'MultipleCounters',
      instancePath:
        counterId === 'root'
          ? []
          : [{ submodelId: 'Counter', instanceId: counterId }],
    },
    token,
  },
})

const action = (
  counterId: string,
  token: string,
  label: string,
): InteractionGraph.InteractionAction<string> => ({
  _tag: 'InteractionAction',
  availability: InteractionGraph.Available.make({}),
  descriptor: token,
  label,
  maybeDestinationUri: Option.none(),
  reference: reference(counterId, token),
  role: 'Default',
})

const row = (counterId: string): InteractionGraph.InteractionGroup<string> => ({
  _tag: 'InteractionGroup',
  children: [
    action(counterId, 'OpenCounter', `Open ${counterId}`),
    action(counterId, 'IncrementCounter', `Increment ${counterId}`),
    action(counterId, 'DeleteCounter', `Delete ${counterId}`),
  ],
  interactionId: reference(counterId, 'row').interactionId,
  label: counterId,
  maybePrimaryInteractionReference: Option.some(
    reference(counterId, 'OpenCounter'),
  ),
  role: 'Row',
})

const projection = (): InteractionGraph.InteractionProjection<string> => ({
  destinationUri: '/counters',
  root: {
    _tag: 'InteractionGroup',
    children: [
      action('root', 'AddCounter', 'Add counter'),
      row('counter-1'),
      row('counter-2'),
    ],
    interactionId: reference('root', 'root').interactionId,
    label: 'Counters',
    maybePrimaryInteractionReference: Option.some(
      reference('root', 'AddCounter'),
    ),
    role: 'List',
  },
})

const value = <A>(maybeValue: Option.Option<A>): A => {
  if (Option.isSome(maybeValue)) {
    return maybeValue.value
  }
  throw new Error('Expected Some')
}

describe('OpenTUI interaction presentation', () => {
  it('keeps semantic shortcuts local to the focused Counter occurrence', () => {
    const graph = projection()
    const focused = reference('counter-2', 'OpenCounter')
    const increment = value(
      referenceForSemanticInteraction(
        graph,
        Option.some(focused),
        'IncrementCounter',
      ),
    )

    expect(increment.interactionId.source.instancePath).toStrictEqual([
      { submodelId: 'Counter', instanceId: 'counter-2' },
    ])
    expect(increment.interactionId.token).toBe('IncrementCounter')
  })

  it('falls back to root actions that remain globally meaningful', () => {
    const add = value(
      referenceForSemanticInteraction(
        projection(),
        Option.some(reference('counter-1', 'OpenCounter')),
        'AddCounter',
      ),
    )

    expect(add.interactionId.source.instancePath).toStrictEqual([])
    expect(add.interactionId.token).toBe('AddCounter')
  })

  it('moves j/k focus through source primaries instead of every action', () => {
    const graph = projection()
    const primaries = sourcePrimaryReferences(graph)
    const firstRow = value(
      movedSourceReference(
        graph,
        Option.some(reference('root', 'AddCounter')),
        1,
      ),
    )
    const secondRow = value(
      movedSourceReference(graph, Option.some(firstRow), 1),
    )

    expect(
      Array.map(primaries, primary => primary.interactionId.token),
    ).toStrictEqual(['AddCounter', 'OpenCounter', 'OpenCounter'])
    expect(firstRow.interactionId.source.instancePath).toStrictEqual([
      { submodelId: 'Counter', instanceId: 'counter-1' },
    ])
    expect(secondRow.interactionId.source.instancePath).toStrictEqual([
      { submodelId: 'Counter', instanceId: 'counter-2' },
    ])
  })

  it('does not turn plus on the root Add source into another row Message', () => {
    const input = normalizeInput('+', 'Browse')
    if (input._tag !== 'Invoke') {
      throw new Error('Expected Invoke')
    }
    expect(
      referenceForSemanticInteraction(
        projection(),
        Option.some(reference('root', 'AddCounter')),
        input.interactionId,
      ),
    ).toStrictEqual(Option.none())
    expect(
      availableSemanticShortcutLabels(
        projection(),
        Option.some(reference('root', 'AddCounter')),
      ),
    ).toStrictEqual(['a add'])
  })

  it('resolves a detail shortcut within its placement group across semantic owners', () => {
    const [listModel] = init()
    const [detailModel] = update(
      listModel,
      SelectedCounter({
        counterId: 'counter-1',
        detailPresentationId: 'detail-1',
      }),
    )
    const detailProjection = interactionProjectionForModel(detailModel)
    const maybeBack = Array.findFirst(
      InteractionGraph.interactiveNodes(detailProjection.root),
      node =>
        node._tag === 'InteractionAction' &&
        node.reference.interactionId.token === 'BackToCounters',
    )
    if (Option.isNone(maybeBack)) {
      throw new Error('Expected detail Back interaction')
    }

    const increment = value(
      referenceForSemanticInteraction(
        detailProjection,
        Option.some(maybeBack.value.reference),
        'IncrementCounter',
      ),
    )

    expect(increment.interactionId.token).toBe('IncrementCounter')
    expect(increment.interactionId.source.instancePath).toStrictEqual([
      { submodelId: 'Counter', instanceId: 'counter-1' },
    ])
    expect(
      availableSemanticShortcutLabels(
        detailProjection,
        Option.some(maybeBack.value.reference),
      ),
    ).toStrictEqual([
      '+ increment',
      '- decrement',
      'r reset',
      'f fact',
      'd/x delete',
      'Esc back',
    ])
  })

  it('preserves root child order when formatting the generic tree', () => {
    const lines = Array.fromIterable(
      formatInteractionProjection(projection()).split('\n'),
    )
    const addIndex = value(
      Array.findFirstIndex(lines, line => line.includes('Add counter')),
    )
    const firstRowIndex = value(
      Array.findFirstIndex(lines, line => line.includes('counter-1')),
    )

    expect(addIndex).toBeLessThan(firstRowIndex)
  })

  it('keeps focus visible inside a bounded long-list viewport', () => {
    expect(
      scrollTopForFocusedBounds({
        scrollTop: 0,
        targetHeight: 1,
        targetScreenY: 12,
        viewportHeight: 6,
        viewportScreenY: 2,
      }),
    ).toBe(5)
    expect(
      scrollTopForFocusedBounds({
        scrollTop: 8,
        targetHeight: 1,
        targetScreenY: 1,
        viewportHeight: 6,
        viewportScreenY: 2,
      }),
    ).toBe(7)
    expect(
      scrollTopForFocusedBounds({
        scrollTop: 4,
        targetHeight: 1,
        targetScreenY: 4,
        viewportHeight: 6,
        viewportScreenY: 2,
      }),
    ).toBe(4)
  })

  it('formats nested groups and semantic focus without a host renderer', () => {
    const lines = Array.fromIterable(
      formatInteractionProjection(
        projection(),
        Option.some(reference('counter-2', 'DeleteCounter')),
      ).split('\n'),
    )

    expect(lines).toContain('  counter-2')
    expect(lines).toContain('    > Delete counter-2')
  })
})
