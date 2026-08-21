import { App, type AppModel, initialCount } from 'counter-core-example'
import { Program, Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { view } from './index.js'

const closedAt = (count: number): AppModel => ({
  product: { count },
  actionMenu: Program.Closed(),
})

const initialModel = closedAt(initialCount)

describe('view', () => {
  test('renders the initial count and hides reset at 0', () => {
    Scene.scene(
      { update: App.update, view },
      Scene.with(initialModel),
      Scene.expect(Scene.text('0')).toExist(),
      Scene.expect(Scene.role('button', { name: '+' })).toExist(),
      Scene.expect(Scene.role('button', { name: '-' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'reset' })).not.toExist(),
    )
  })

  test('clicking + increments the displayed count', () => {
    Scene.scene(
      { update: App.update, view },
      Scene.with(initialModel),
      Scene.click(Scene.role('button', { name: '+' })),
      Scene.expect(Scene.text('1')).toExist(),
      Scene.click(Scene.role('button', { name: '+' })),
      Scene.expect(Scene.text('2')).toExist(),
    )
  })

  test('clicking - decrements the displayed count', () => {
    Scene.scene(
      { update: App.update, view },
      Scene.with(closedAt(3)),
      Scene.click(Scene.role('button', { name: '-' })),
      Scene.expect(Scene.text('2')).toExist(),
    )
  })

  test('clicking - past zero produces a negative count', () => {
    Scene.scene(
      { update: App.update, view },
      Scene.with(initialModel),
      Scene.click(Scene.role('button', { name: '-' })),
      Scene.expect(Scene.text('-1')).toExist(),
    )
  })

  test('Reset returns the count to zero', () => {
    Scene.scene(
      { update: App.update, view },
      Scene.with(closedAt(42)),
      Scene.click(Scene.role('button', { name: 'reset' })),
      Scene.expect(Scene.text('0')).toExist(),
    )
  })
})
