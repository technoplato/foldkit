import {
  Model,
  SyncedCounter,
  actionByToken,
  counterFactHandles,
  counterScreen,
  readyCounter,
} from 'counter-core-example'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { factHandleForKey, renderCounterScreenWindow } from './client.js'
import { paintTui } from './paintTui.js'

const stripAnsi = (painted: string): string =>
  painted.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')

const keysForToken = (token: string): ReadonlyArray<string> => {
  const action = actionByToken(token)
  if (action === undefined) {
    return []
  }
  return action.keys ?? []
}

describe('paintTui', () => {
  it('paints Buttons with key hints from the Action keys metadata', () => {
    const painted = stripAnsi(
      paintTui(counterScreen(Model.make({ count: 0 })), { keysForToken }),
    )

    expect(painted).toBe('0\n[+] increment  [-] decrement')
  })

  it('paints reset with its key hint once the count is above 0', () => {
    const painted = stripAnsi(
      paintTui(counterScreen(Model.make({ count: 2 })), { keysForToken }),
    )

    expect(painted).toBe('2\n[+] increment  [-] decrement  [r] reset')
  })

  it('hides reset from the screen window at 0', () => {
    const window = stripAnsi(renderCounterScreenWindow(readyCounter(0)))

    expect(window).toContain('0')
    expect(window).toContain('[+] increment')
    expect(window).toContain('[-] decrement')
    expect(window).not.toContain('reset')
    expect(window).toContain('[Q] quit')
  })

  it('shows reset in the screen window above 0', () => {
    const window = stripAnsi(renderCounterScreenWindow(readyCounter(2)))

    expect(window).toContain('2')
    expect(window).toContain('[r] reset')
  })

  it('paints the init screen while Starting, like the React default window', () => {
    const window = stripAnsi(
      renderCounterScreenWindow(SyncedCounter.Starting()),
    )

    expect(window).toContain('0')
    expect(window).toContain('[+] increment')
    expect(window).not.toContain('reset')
  })

  it('agrees with the derived keymap on every painted hint', () => {
    const handles = counterFactHandles(Model.make({ count: 2 }), () => {})
    const painted = stripAnsi(
      paintTui(counterScreen(Model.make({ count: 2 })), { keysForToken }),
    )
    const hints = [...painted.matchAll(/\[(.)\] \w/g)].map(match => match[1])

    expect(hints).toEqual(['+', '-', 'r'])
    for (const hint of hints) {
      expect(Option.isSome(factHandleForKey(hint ?? '', handles))).toBe(true)
    }
  })
})
