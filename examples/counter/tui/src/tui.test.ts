import {
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
  Model,
} from 'counter-core-example'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { messageForInput, renderCounterScreen } from './host.js'

describe('Counter TUI', () => {
  it('renders the imported Model and every interactive control', () => {
    const screen = renderCounterScreen(Model.make({ count: 2 }))

    expect(screen).toContain('2')
    expect(screen).toContain('[-] decrement')
    expect(screen).toContain('[R] reset')
    expect(screen).toContain('[+] increment')
    expect(screen).toContain('[Q] quit')
  })

  it('maps controls to the imported Message constructors', () => {
    expect(messageForInput('+')).toEqual(Option.some(ClickedIncrement()))
    expect(messageForInput('=')).toEqual(Option.some(ClickedIncrement()))
    expect(messageForInput('-')).toEqual(Option.some(ClickedDecrement()))
    expect(messageForInput('R')).toEqual(Option.some(ClickedReset()))
    expect(messageForInput('q')).toEqual(Option.none())
  })
})
