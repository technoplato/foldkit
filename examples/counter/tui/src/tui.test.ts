import {
  Decrement,
  Increment,
  type Message,
  Model,
  Reset,
  SyncedCounter,
  counterFactHandles,
  readyCounter,
} from 'counter-core-example'
import { Option } from 'effect'
import { Program } from 'foldkit'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { factHandleForKey, renderCounterScreen, tapForInput } from './client.js'

describe('Counter TUI', () => {
  it('paints Starting before Instant is ready', () => {
    const screen = renderCounterScreen(SyncedCounter.Starting())

    expect(screen).toContain('Starting Instant Counter')
    expect(screen).toContain('[Q] quit')
    expect(screen).not.toContain('[ + ]')
  })

  it('paints Failed with the Instant error', () => {
    const screen = renderCounterScreen(
      SyncedCounter.Failed({
        error: SyncedCounter.TransportFailed({
          what: 'Instant did not return a snapshot.',
          meaning: 'This Processor could not start from Instant.',
          fix: 'Check the Instant app and try again.',
          cause:
            'Instant() needs INSTANT_APP_ADMIN_TOKEN in the trusted wrapper.',
        }),
      }),
    )

    expect(screen).toContain('INSTANT_APP_ADMIN_TOKEN')
    expect(screen).toContain('Cause:')
    expect(screen).not.toContain('TransportFailed')
    expect(screen).not.toContain('[S] sign in')
    expect(screen).toContain('[Q] quit')
    expect(screen).not.toContain('[ + ]')
  })

  it('prints computer chrome around the product tree and hides reset at 0', () => {
    const screen = renderCounterScreen(readyCounter(0))

    expect(screen).toContain('Foldkit - TUI Counter')
    expect(screen).toContain('/counter')
    expect(screen).toContain('0')
    expect(screen).toContain('[ + ]')
    expect(screen).toContain('[ - ]')
    expect(screen).not.toContain('[ reset ]')
    expect(screen).toContain('[Q] quit')
    expect(screen).not.toContain('laptop')
  })

  it('prints reset from the product tree when the count is not 0', () => {
    const screen = renderCounterScreen(readyCounter(2))

    expect(screen).toContain('[ reset ]')
  })

  it('paints the Action menu when Open and keeps reset Hidden at 0', () => {
    const screen = renderCounterScreen(
      readyCounter(0, Program.Open({ focus: 0, maybeQuery: Option.none() })),
    )

    expect(screen).toContain('Actions')
    expect(screen).toContain('> [ + ] increment')
    expect(screen).toContain('[ r ] reset: count is already 0')
    expect(screen).toContain('┌')
    expect(screen).toContain('0')
    expect(screen).toContain('[ + ]')
    expect(screen.indexOf('Actions')).toBeLessThan(screen.indexOf('[ + ]'))
  })

  it('paints named Empty when the Open filter matches nothing', () => {
    const screen = renderCounterScreen(
      readyCounter(
        0,
        Program.Open({ focus: 0, maybeQuery: Option.some('zzz') }),
      ),
    )
    expect(screen).toContain('Empty')
    expect(screen).toContain('Actions  zzz')
    expect(screen).not.toContain('> [ + ] increment')
    expect(screen).not.toContain('> increment')
  })

  it('derives the keymap from the keys metadata', () => {
    const handles = counterFactHandles(Model.make({ count: 0 }), () => {})

    expect(factHandleForKey('+', handles)._tag).toBe('Some')
    expect(factHandleForKey('=', handles)._tag).toBe('Some')
    expect(factHandleForKey('-', handles)._tag).toBe('Some')
    expect(factHandleForKey('R', handles)._tag).toBe('Some')
    expect(factHandleForKey('q', handles)).toEqual(Option.none())
    expect(factHandleForKey('x', handles)).toEqual(Option.none())
  })

  it('taps only Tappable handles for a keypress', () => {
    const sent: Array<Message> = []
    const send = (message: Message): void => {
      sent.push(message)
    }

    const atZero = counterFactHandles(Model.make({ count: 0 }), send)
    tapForInput('+', atZero)
    tapForInput('=', atZero)
    tapForInput('-', atZero)
    tapForInput('R', atZero)
    tapForInput('x', atZero)
    expect(sent).toEqual([Increment(), Increment(), Decrement()])

    const atTwo = counterFactHandles(Model.make({ count: 2 }), send)
    tapForInput('R', atTwo)
    expect(sent).toEqual([Increment(), Increment(), Decrement(), Reset()])
  })

  it('keeps Instant out of the TUI Client', () => {
    const viewSource = readFileSync('src/client.ts', 'utf8')
    expect(viewSource).toContain('handle.subscribe')
    expect(viewSource).toContain('handle.actions')
    expect(viewSource).toContain('Starting')
    expect(viewSource).toContain('Failed')
    expect(viewSource).toContain('Ready')
    expect(viewSource).toContain('describeCounterSyncError')
    expect(viewSource).not.toContain('StartingWindow')
    expect(viewSource).not.toContain('FailedWindow')
    expect(viewSource).not.toContain('ReadyWindow')
    expect(viewSource).not.toContain('[S] sign in')
    expect(viewSource).not.toContain('@instantdb')
    expect(viewSource).not.toContain('@foldkit/instant')
    expect(viewSource).not.toContain('instantHost')
    expect(viewSource).not.toContain('store.send')
    expect(viewSource).not.toContain('store.observe')
    expect(viewSource).not.toContain('void Effect')
    expect(viewSource).not.toContain('Effect.orDie')
  })
})
