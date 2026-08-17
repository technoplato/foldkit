import {
  FailedWindow,
  Increment,
  Model,
  ReadyWindow,
  StartingWindow,
} from 'counter-core-example'
import { Option } from 'effect'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { messageForInput, renderCounterScreen } from './client.js'

describe('Counter TUI', () => {
  it('paints Starting before Instant is ready', () => {
    const screen = renderCounterScreen(StartingWindow.make({}))

    expect(screen).toContain('Starting Instant Counter')
    expect(screen).toContain('[Q] quit')
    expect(screen).not.toContain('[ + ]')
  })

  it('paints Failed with the Instant error', () => {
    const screen = renderCounterScreen(
      FailedWindow.make({
        error:
          'COUNTER_TAPE=instant needs INSTANT_APP_ID. Use the foldkit Instant demo wrapper.',
      }),
    )

    expect(screen).toContain('INSTANT_APP_ID')
    expect(screen).toContain('[S] sign in')
    expect(screen).toContain('[Q] quit')
    expect(screen).not.toContain('[ + ]')
  })

  it('prints computer chrome around the product tree and hides reset at 0', () => {
    const screen = renderCounterScreen(ReadyWindow.make({ count: 0 }))

    expect(screen).toContain('/counter')
    expect(screen).toContain('0')
    expect(screen).toContain('[ + ]')
    expect(screen).toContain('[ - ]')
    expect(screen).not.toContain('[ reset ]')
    expect(screen).toContain('[Q] quit')
    expect(screen).not.toContain('laptop')
  })

  it('prints reset from the product tree when the count is not 0', () => {
    const screen = renderCounterScreen(ReadyWindow.make({ count: 2 }))

    expect(screen).toContain('[ reset ]')
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

  it('keeps Instant out of the TUI Client', () => {
    const viewSource = readFileSync('src/client.ts', 'utf8')
    expect(viewSource).toContain('runtime.subscribe')
    expect(viewSource).toContain('runtime.actions')
    expect(viewSource).toContain('StartingWindow')
    expect(viewSource).toContain('FailedWindow')
    expect(viewSource).toContain('ReadyWindow')
    expect(viewSource).not.toContain('@instantdb')
    expect(viewSource).not.toContain('@foldkit/instant')
    expect(viewSource).not.toContain('instantHost')
    expect(viewSource).not.toContain('store.send')
    expect(viewSource).not.toContain('store.observe')
    expect(viewSource).not.toContain('void Effect')
    expect(viewSource).not.toContain('Effect.orDie')
  })
})
