import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { wrapDevice } from './devices/devices.js'
import { Button, Column, Row, Text, TextInput } from './elements.js'
import { Host } from './host.js'
import { buttonsOf, textsOf } from './query.js'
import { renderAscii, renderScreen } from './render.js'

describe('atoms', () => {
  it('builds a Column of Text and a Row of Buttons', () => {
    const tree = Column(
      {},
      Text('0'),
      Row(
        {},
        Button({ label: '+', token: 'increment' }),
        Button({ label: '-' }),
      ),
    )

    expect(Array.map(textsOf(tree), text => text.content)).toEqual(['0'])
    expect(Array.map(buttonsOf(tree), button => button.label)).toEqual([
      '+',
      '-',
    ])
    expect(Option.getOrUndefined(Array.head(buttonsOf(tree)))?.token).toBe(
      'increment',
    )
  })

  it('paints product buttons from the tree', () => {
    const screen = renderScreen(
      Column(
        {},
        Text('0'),
        Row(
          {},
          Button({ label: '+', token: 'increment' }),
          Button({ label: '-', token: 'decrement' }),
        ),
      ),
    )

    expect(screen).toContain('0')
    expect(screen).toContain('[ + ]')
    expect(screen).toContain('[ - ]')
    expect(screen).not.toContain('[ reset ]')
  })

  it('paints a TextInput value', () => {
    expect(renderScreen(TextInput({ value: 'hello' }))).toContain('hello')
  })

  it('records a hotspot from a Button token', () => {
    const frame = renderAscii(Button({ label: '+', token: 'increment' }))
    const maybeHotspot = Array.head(frame.hotspots)

    expect(Option.isSome(maybeHotspot)).toBe(true)
    if (Option.isSome(maybeHotspot)) {
      expect(maybeHotspot.value.action).toEqual({
        _tag: 'custom',
        id: 'increment',
      })
    }
  })
})

describe('Host', () => {
  it('is how the process runs, not Device chrome', () => {
    const decoded = S.decodeUnknownSync(S.Array(Host))([
      'cli',
      'tui',
      'headless',
      'foldkit',
      'react',
      'expo',
    ])

    expect(decoded).toEqual([
      'cli',
      'tui',
      'headless',
      'foldkit',
      'react',
      'expo',
    ])
    expect(S.decodeUnknownExit(Host)('computer')._tag).toBe('Failure')
    expect(S.decodeUnknownExit(Host)('laptop')._tag).toBe('Failure')
  })
})

describe('device shells', () => {
  it('wraps a product tree and does not invent increment buttons', () => {
    const screen = renderScreen(wrapDevice('watch', Text('hello')))

    expect(screen).toContain('hello')
    expect(screen).toContain('9:41')
    expect(screen).not.toContain('[ + ]')
    expect(screen).not.toContain('[ - ]')
    expect(screen).not.toContain('increment')
    expect(screen).not.toContain('decrement')
  })

  it('paints product buttons inside phone chrome', () => {
    const product = Column(
      {},
      Text('1'),
      Row(
        {},
        Button({ label: '+', token: 'increment' }),
        Button({ label: 'reset', token: 'reset' }),
      ),
    )
    const screen = renderScreen(wrapDevice('phone', product))

    expect(screen).toContain('1')
    expect(screen).toContain('[ + ]')
    expect(screen).toContain('[ reset ]')
    expect(screen).toContain('9:41')
    expect(screen).toContain('─────')
    const maybeTop = Array.head(screen.split('\n'))
    expect(Option.isSome(maybeTop)).toBe(true)
    if (Option.isSome(maybeTop)) {
      expect(maybeTop.value.length).toBeLessThan(40)
    }
  })

  it('uses computer chrome, not laptop', () => {
    const screen = renderScreen(
      wrapDevice('computer', Text('0'), { title: '/app' }),
    )

    expect(screen).toContain('0')
    expect(screen).toContain('/app')
    expect(screen).toContain('● ● ●')
    expect(screen).not.toContain('laptop')
  })
})
