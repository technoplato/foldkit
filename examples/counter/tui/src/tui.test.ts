import { Increment, Model } from 'counter-core-example'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { messageForInput, renderCounterScreen } from './host.js'

describe('Counter TUI', () => {
  it('prints core laptop chrome and hides reset at 0', () => {
    const screen = renderCounterScreen(Model.make({ count: 0 }))

    expect(screen).toContain('/counter')
    expect(screen).toContain('            0             ')
    expect(screen).toContain('[ - ]            [ + ]')
    expect(screen).not.toContain('[reset]')
    expect(screen).toContain('[Q] quit')
  })

  it('prints reset in core chrome when the count is not 0', () => {
    const screen = renderCounterScreen(Model.make({ count: 2 }))

    expect(screen).toContain('[reset]')
  })

  it('maps keys to the imported Message constructors', () => {
    const atZero = Model.make({ count: 0 })
    const atTwo = Model.make({ count: 2 })

    expect(messageForInput('+', atZero)).toEqual(Option.some(Increment()))
    expect(messageForInput('=', atZero)).toEqual(Option.some(Increment()))
    expect(messageForInput('-', atZero)._tag).toBe('Some')
    expect(messageForInput('R', atZero)).toEqual(Option.none())
    expect(messageForInput('R', atTwo)._tag).toBe('Some')
    expect(messageForInput('q', atZero)).toEqual(Option.none())
  })
})
