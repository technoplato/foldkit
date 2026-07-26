import { CounterList, modelForNavigation, update } from 'counters-core-example'
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
    )
  })

  test('renders delete confirmation as the only active detail mode', () => {
    Scene.scene(
      { update, view },
      Scene.with(modelForNavigation(CounterList.make({}))),
      Scene.click(Scene.role('button', { name: 'Open counter-1' })),
      Scene.click(Scene.role('button', { name: 'Delete counter' })),
      Scene.expect(Scene.text('Delete counter-1?')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Cancel' })).toExist(),
      Scene.expect(
        Scene.role('button', { name: 'Show counter fact' }),
      ).not.toExist(),
    )
  })
})
