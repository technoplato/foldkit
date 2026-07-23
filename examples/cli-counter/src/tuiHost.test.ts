import { describe, expect, it } from 'vitest'

import { Loading, Ready, Saving } from './counter.js'
import { renderCounterScreen } from './tuiHost.js'

describe('Counter TUI rendering', () => {
  it('renders every portable mode', () => {
    expect(renderCounterScreen(Loading())).toContain('Loading...')
    expect(renderCounterScreen(Ready({ count: 2 }))).toContain('Saved')
    expect(renderCounterScreen(Saving({ count: 3 }))).toContain('Saving...')
  })

  it('labels every interactive control', () => {
    const screen = renderCounterScreen(Ready({ count: 2 }))
    expect(screen).toContain('[-] decrement')
    expect(screen).toContain('[R] reset')
    expect(screen).toContain('[+] increment')
    expect(screen).toContain('[Q] quit')
  })
})
