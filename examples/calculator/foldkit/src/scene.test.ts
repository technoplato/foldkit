import { initialModel, update } from 'calculator-core-example'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { view } from './index.js'

describe('Calculator Foldkit view', () => {
  test('renders the initial display and calculator controls', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.expect(Scene.text('0')).toExist(),
      Scene.expect(Scene.role('button', { name: '1' })).toExist(),
      Scene.expect(Scene.role('button', { name: '+' })).toExist(),
      Scene.expect(Scene.role('button', { name: '=' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'AC' })).toExist(),
      Scene.expect(Scene.role('button', { name: '+/-' })).toExist(),
      Scene.expect(Scene.role('button', { name: '%' })).toExist(),
      Scene.expect(Scene.role('button', { name: '⌫' })).toExist(),
    )
  })

  test('clicking buttons displays the expression until equals evaluates it', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.click(Scene.role('button', { name: '6' })),
      Scene.click(Scene.role('button', { name: '6' })),
      Scene.click(Scene.role('button', { name: '×' })),
      Scene.click(Scene.role('button', { name: '7' })),
      Scene.click(Scene.role('button', { name: '7' })),
      Scene.expect(Scene.text('66×77')).toExist(),
      Scene.expect(Scene.text('5,082')).not.toExist(),
      Scene.click(Scene.role('button', { name: '=' })),
      Scene.expect(Scene.text('66×77')).toExist(),
      Scene.expect(Scene.text('5,082')).toExist(),
    )
  })

  test('clicking clear restores zero', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.click(Scene.role('button', { name: '9' })),
      Scene.click(Scene.role('button', { name: 'AC' })),
      Scene.expect(Scene.text('0')).toExist(),
    )
  })
})
