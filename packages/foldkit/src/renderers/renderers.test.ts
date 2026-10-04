import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { wrapDevice } from './devices/devices.js'
import {
  Button,
  Column,
  List,
  Row,
  Seek,
  Text,
  TextInput,
  Transcript,
} from './elements.js'
import { Host } from './host.js'
import { paintHtml, paintMobile, paintStatusHtml } from './html.js'
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

describe('row checks and fields that press', () => {
  const reminders = List({
    label: 'Groceries',
    items: [
      {
        key: 'r1',
        title: 'Oat milk',
        check: {
          isChecked: false,
          label: 'Mark Oat milk done',
          action: 'Complete:r1',
        },
        action: 'OpenReminder:r1',
      },
      {
        key: 'r2',
        title: 'Olive oil',
        check: { isChecked: true, label: 'Mark Olive oil not done' },
      },
    ],
  })

  it('paints a row check as its own pressable box before the title', () => {
    const frame = renderAscii(reminders)
    expect(frame.lines.join('\n')).toContain(' [ ] ')
    expect(frame.lines.join('\n')).toContain(' [x] ')
    expect(Array.map(frame.hotspots, hotspot => hotspot.action.id)).toEqual([
      'Complete:r1',
      'OpenReminder:r1',
    ])
  })

  it('paints a field that presses as a bracketed field with its label', () => {
    const screen = renderScreen(
      TextInput({
        value: '',
        placeholder: 'New reminder',
        action: 'AddReminder',
        label: 'New reminder in Groceries',
      }),
    )
    expect(screen).toContain('[ New reminder ]')
  })

  it('paints a row check in HTML as a checkbox that presses its action', () => {
    const painted = JSON.stringify(paintHtml(reminders, tag => tag))
    expect(painted).toContain('fk-item-check')
    expect(painted).toContain('"role":"checkbox"')
    expect(painted).toContain('Mark Oat milk done')
  })

  it('paints a field that presses in HTML with its label', () => {
    const painted = JSON.stringify(
      paintHtml(
        TextInput({
          value: '',
          placeholder: 'New reminder',
          action: 'AddReminder',
          label: 'New reminder in Groceries',
        }),
        tag => tag,
      ),
    )
    expect(painted).toContain('New reminder in Groceries')
    expect(painted).toContain('fk-text-input')
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

  it('paints a Text image as an img with its words as alt text', () => {
    const vnode = paintHtml(
      Text('A cover', {
        image: {
          src: 'https://files.example/cover.jpg',
          width: 120,
          height: 180,
        },
      }),
      token => token,
    )
    const painted = JSON.stringify(vnode)
    expect(painted).toContain('"sel":"img"')
    expect(painted).toContain('https://files.example/cover.jpg')
    expect(painted).toContain('A cover')
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

describe('text emphasis and status', () => {
  it('marks Display text for the shared stylesheet', () => {
    expect(
      JSON.stringify(
        paintHtml(Text('3', { emphasis: 'Display' }), () => undefined),
      ),
    ).toContain('Display')
  })

  it('paints a status description with the shared styles', () => {
    const painted = JSON.stringify(paintStatusHtml('Starting Counter…'))
    expect(painted).toContain('fk-status')
    expect(painted).toContain('Starting Counter…')
  })
})

describe('a seek bar and a transcript in a terminal', () => {
  it('draws the place on the bar with how it reads', () => {
    expect(
      renderScreen(
        Seek({
          value: 30,
          max: 60,
          action: 'SeekTo',
          label: 'Place',
          valueText: '0:30 of 1:00',
        }),
        30,
      ),
    ).toBe('━━━━━━━━●──────── 0:30 of 1:00')
  })

  it('wraps each passage under its time and brackets the word sounding', () => {
    const painted = renderScreen(
      Transcript({
        label: 'Transcript',
        action: 'SeekToWord',
        emptyText: 'No transcript yet',
        passages: [
          {
            key: 's1',
            label: '0:19',
            isCurrent: true,
            words: Array.map(
              ['Evocation', 'Earth,', '114', 'million', 'years', 'ago'],
              (text, index) => ({
                token: `w${index.toString()}`,
                text,
                isCurrent: index === 2,
              }),
            ),
          },
        ],
      }),
      30,
    )
    expect(painted.split('\n')).toEqual([
      '›0:19   Evocation Earth, [114]',
      '        million years ago     ',
    ])
    expect(
      renderScreen(
        Transcript({
          label: 'Transcript',
          action: 'SeekToWord',
          emptyText: 'No transcript yet',
          passages: [],
        }),
      ),
    ).toBe('No transcript yet')
  })
})
