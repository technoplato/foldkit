import {
  CounterProgram,
  type Model,
  counterScreen,
  counterValid,
} from 'counter-core-example'
import { Array } from 'effect'
import { Scene } from 'foldkit'
import { padOf } from 'foldkit/renderers'
import { describe, expect, test } from 'vitest'

import { view } from './mobile.js'

const at = (count: number): Model => ({ count })

describe('mobile view', () => {
  test('paints the screen and pad keys from Action keys, not a hardcoded list', () => {
    Scene.scene(
      { update: CounterProgram.update, view },
      Scene.with(at(0)),
      Scene.expect(Scene.text('0')).toExist(),
      Scene.expect(Scene.role('button', { name: '+' })).toExist(),
      Scene.expect(Scene.role('button', { name: '=' })).toExist(),
      Scene.expect(Scene.role('button', { name: '-' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'r' })).not.toExist(),
      Scene.expect(Scene.role('button', { name: 'reset' })).not.toExist(),
      Scene.expect(Scene.role('button', { name: '×' })).not.toExist(),
      Scene.expect(Scene.text('Foldkit - Foldkit Counter')).not.toExist(),
      Scene.expect(Scene.text('github.com')).not.toExist(),
    )
  })

  test('tapping a pad key sends the Action token', () => {
    Scene.scene(
      { update: CounterProgram.update, view },
      Scene.with(at(0)),
      Scene.click(Scene.role('button', { name: '=' })),
      Scene.expect(Scene.text('1')).toExist(),
    )
  })

  test('reset appears on the pad only when it is on the screen', () => {
    Scene.scene(
      { update: CounterProgram.update, view },
      Scene.with(at(2)),
      Scene.expect(Scene.role('button', { name: 'r' })).toExist(),
      Scene.expect(Scene.role('button', { name: 'reset' })).toExist(),
      Scene.click(Scene.role('button', { name: 'reset' })),
      Scene.expect(Scene.text('0')).toExist(),
      Scene.expect(Scene.role('button', { name: 'reset' })).not.toExist(),
    )
  })
})

describe('pad of counterScreen', () => {
  test('keys come from Action keys on the screen', () => {
    const atZero = counterScreen({ count: 0 }, { device: 'phone' })
    const pad = padOf(atZero, counterValid({ count: 0 }))

    expect(Array.map(pad.keys, key => key.key)).toEqual(['+', '=', '-'])
    expect(Array.map(pad.buttons, button => button.token)).toEqual([
      'increment',
      'decrement',
    ])
  })
})
