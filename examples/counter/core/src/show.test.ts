import { describe, expect, test } from 'vitest'

import { Model } from './model.js'
import {
  defaultShowContext,
  invalidActionLog,
  renderReceipt,
  renderShow,
} from './show.js'

describe('renderShow', () => {
  test('prints IDENTITY, ACESS, and chrome at count 0', () => {
    const output = renderShow(Model.make({ count: 0 }), defaultShowContext)

    expect(output).toContain('IDENTITY')
    expect(output).toContain('title    counter')
    expect(output).toContain('uri      /counter')
    expect(output).toContain('targets  watch, phone, tablet, laptop, tv')
    expect(output).toContain('STATE')
    expect(output).toContain('count    0')
    expect(output).toContain('focus    increment')
    expect(output).toContain('keys           [+, =]')
    expect(output).toContain('tokens         [increment]')
    expect(output).toContain('spoken         ["increment"]')
    expect(output).toContain('what           Increments the count by one')
    expect(output).toContain(
      'why            Triggered when the user indicates a desire to increment the count',
    )
    expect(output).toContain('command        increment')
    expect(output).toContain('event          incremented')
    expect(output).toContain('mutate         count = count + 1')
    expect(output).toContain('side effects   (none)')
    expect(output).toContain('valid          true')
    expect(output).toContain('focus          here')
    expect(output).toContain('valid          false')
    expect(output).toContain('hidden         count is already 0')
    expect(output).toContain('COMMANDS')
    expect(output).toContain('(none yet)')
    expect(output).toContain('EVENTS')
    expect(output).toContain('SIDE EFFECTS')
    expect(output).toContain('(none)')
    expect(output).toContain('│ [-]     [+]  │')
    expect(output).toContain('│ [ - ]          [ + ] │')
    expect(output).not.toContain('│ [-] [r] [+]  │')
    expect(output).not.toContain('│ [ - ] [reset] [ + ]  │')
  })

  test('prints reset chrome when the count is not 0', () => {
    const output = renderShow(Model.make({ count: 1 }), {
      ...defaultShowContext,
      last: {
        command: 'increment',
        event: 'incremented',
        sideEffects: ['tape append', 'link  offline'],
      },
    })

    expect(output).toContain('count    1')
    expect(output).toContain('│ [-] [r] [+]  │')
    expect(output).toContain('│ [ - ] [reset] [ + ]  │')
    expect(output).toContain('║  [ - ]  [reset]  [ + ]   ║')
    expect(output).toContain('COMMANDS\n  increment')
    expect(output).toContain('EVENTS\n  incremented')
    expect(output).toContain('tape append')
    expect(output).toContain('link  offline')
    expect(output).not.toContain('hidden         count is already 0')
  })

  test('can filter to one Action path', () => {
    const output = renderShow(Model.make({ count: 0 }), {
      ...defaultShowContext,
      path: 'counter.increment',
    })

    expect(output).toContain('  increment')
    expect(output).not.toContain('  decrement')
    expect(output).not.toContain('  reset')
  })
})

describe('receipt and invalid send', () => {
  test('prints increment sent from cli via argv', () => {
    expect(
      renderReceipt({
        token: 'increment',
        verb: 'sent',
        from: 'cli',
        via: 'argv',
        command: 'increment',
        event: 'incremented',
        mutate: 'count = count + 1',
        sideEffects: '(none)',
        tape: 'appended',
        link: 'offline',
      }),
    ).toBe(
      [
        'increment sent',
        '  from           cli',
        '  via            argv',
        '  command        increment',
        '  message        increment',
        '  event          incremented',
        '  mutate         count = count + 1',
        '  side effects   (none)',
        '  tape           appended',
        '  link           offline',
      ].join('\n'),
    )
  })

  test('logs an invalid reset at count 0', () => {
    expect(invalidActionLog('reset', Model.make({ count: 0 }))).toBe(
      'log  attempted to invoke invalid action reset\n     state  count 0',
    )
  })
})
