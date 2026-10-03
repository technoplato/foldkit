import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { wrapDevice } from './devices/devices.js'
import { Button, Column, Row, Text, TextInput } from './elements.js'
import { Host } from './host.js'
import { paintHtml, paintMobile } from './html.js'
import { padOf } from './pad.js'
import { buttonsOf, inputsOf, textsOf } from './query.js'
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
    expect(
      Array.map(
        inputsOf(TextInput({ value: 'hello', token: 'comment-draft:' })),
        input => input.token,
      ),
    ).toEqual(['comment-draft:'])
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

describe('paintHtml', () => {
  it('paints Button labels and keeps the token as the click Message', () => {
    const tree = Column(
      {},
      Text('0'),
      Row({}, Button({ label: '+', token: 'increment' })),
    )
    const vnode = paintHtml(tree, token => token)

    expect(vnode).not.toBeNull()
    expect(vnode?.sel).toBe('div')
    expect(JSON.stringify(vnode)).toContain('+')
    expect(JSON.stringify(vnode)).toContain('0')
  })

  it('paints Text href as an anchor', () => {
    const href = 'https://puzzle.knophy.com'
    const vnode = paintHtml(Text(href, { href }), token => token)

    expect(JSON.stringify(vnode)).toContain(href)
    expect(JSON.stringify(vnode)).toContain('fk-text-link')
  })

  it('paints a TextInput as an input bound to its token', () => {
    const vnode = paintHtml(
      TextInput({
        placeholder: 'Comment',
        token: 'comment-draft:',
        value: 'hello',
      }),
      token => token,
    )

    expect(vnode?.sel).toBe('input')
    expect(JSON.stringify(vnode)).toContain('hello')
    expect(JSON.stringify(vnode)).toContain('Comment')
    expect(JSON.stringify(vnode)).toContain('fk-text-input')
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

describe('paintMobile', () => {
  it('paints the screen and pad keys from Action keys', () => {
    const screen = Column(
      {},
      Text('0'),
      Row({}, Button({ label: '+', token: 'increment' })),
    )
    const pad = padOf(screen, [{ token: 'increment', keys: ['+', '='] }])
    const vnode = paintMobile(screen, pad, token => token)

    expect(JSON.stringify(vnode)).toContain('fk-mobile')
    expect(JSON.stringify(vnode)).toContain('fk-mobile-key')
    expect(JSON.stringify(vnode)).toContain('=')
    expect(JSON.stringify(vnode)).not.toContain('reset')
  })
})
