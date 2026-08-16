import { StartingWindow } from 'counter-core-example'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  paintCounterHostStatus,
  reportAttachedFoldkitFailure,
} from './instantHost.js'

describe('Counter Foldkit Instant host chrome', () => {
  it('paints Starting and Failed, then leaves Ready to Foldkit', () => {
    const container = document.createElement('div')
    const actions = {
      clickedDecrement: () => {},
      clickedIncrement: () => {},
      clickedReset: () => {},
      signIn: () => {},
    }
    expect(
      paintCounterHostStatus(container, StartingWindow.make({}), actions),
    ).toBe(true)
    expect(container.textContent).toContain('Starting Instant Counter')
    expect(
      paintCounterHostStatus(
        container,
        { _tag: 'FailedWindow', error: 'Instant has no Counter demo user.' },
        actions,
      ),
    ).toBe(true)
    expect(container.textContent).toContain('Instant has no Counter demo user.')
    expect(container.querySelector('button')?.textContent).toBe('Sign in')
    expect(
      paintCounterHostStatus(
        container,
        { _tag: 'ReadyWindow', count: 3 },
        actions,
      ),
    ).toBe(false)
  })

  it('opens Instant through the shared browser tape', () => {
    const source = readFileSync('src/instantHost.ts', 'utf8')
    expect(source).toContain('counter-instant-example/browser')
    expect(source).toContain('openLiveCounterWindowTape')
    expect(source).not.toContain('@instantdb')
    expect(source).not.toContain('void Effect.runPromise')
  })

  it('keeps Instant out of the Foldkit window view', () => {
    const viewSource = readFileSync('src/view.ts', 'utf8')
    expect(viewSource).toContain('paintHtml')
    expect(viewSource).toContain('counterScreen')
    expect(viewSource).not.toContain('@instantdb')
    expect(viewSource).not.toContain('@foldkit/instant')
    expect(viewSource).not.toContain('store.send')
    expect(viewSource).not.toContain('store.observe')
    expect(viewSource).not.toContain('void Effect.runPromise')
    expect(viewSource).not.toContain('Button.view')
  })

  it('reports attach failure through the window runtime', () => {
    const failures: Array<string> = []
    reportAttachedFoldkitFailure(
      {
        fail: error => {
          failures.push(error)
        },
      },
      new Error('Foldkit could not attach the Counter screen.'),
    )
    expect(failures).toEqual(['Foldkit could not attach the Counter screen.'])
  })
})
