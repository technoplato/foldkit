import {
  CancelledDeleteCounter,
  ClickedDeleteCounter,
  CounterList,
  SelectedCounter,
  modelForNavigation,
  update,
} from 'counters-core-example'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { view } from './main'

describe('Multiple Counters Foldkit view', () => {
  test('renders every identified Counter and its valid controls', () => {
    Scene.scene(
      { update, view },
      Scene.with(modelForNavigation(CounterList.make({}))),
      Scene.expect(Scene.text('counter-1')).toExist(),
      Scene.expect(Scene.text('counter-2')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Open counter-1' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'Add counter' })).toExist(),
      Scene.Mount.resolve(
        view.ObserveMultipleCountersClientEvents,
        SelectedCounter({
          counterId: 'counter-1',
          detailPresentationId: 'detail-scene-open',
        }),
      ),
    )
  })

  test('renders delete confirmation as the only active detail mode', () => {
    const detailPresentationId = 'detail-scene-delete'
    const confirmationId = 'delete-scene-delete'
    const [detailModel] = update(
      modelForNavigation(CounterList.make({})),
      SelectedCounter({
        counterId: 'counter-1',
        detailPresentationId,
      }),
    )
    const [deleteModel] = update(
      detailModel,
      ClickedDeleteCounter({
        confirmationId,
        counterId: 'counter-1',
        detailPresentationId,
      }),
    )
    Scene.scene(
      { update, view },
      Scene.with(deleteModel),
      Scene.expect(Scene.text('Delete counter-1?')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Cancel' })).toExist(),
      Scene.expect(
        Scene.role('button', { name: 'Show counter fact' }),
      ).not.toExist(),
      Scene.Mount.resolve(
        view.ObserveMultipleCountersClientEvents,
        CancelledDeleteCounter({
          confirmationId,
          counterId: 'counter-1',
          detailPresentationId,
        }),
      ),
    )
  })
})
