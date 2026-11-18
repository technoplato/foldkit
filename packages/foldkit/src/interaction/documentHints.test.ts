import { Option } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { hintShowDelayMs, listenForHints, showEcho } from './documentHints.js'

const stops: Array<() => void> = []

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  stops.splice(0).forEach(stop => {
    stop()
  })
  document.body.replaceChildren()
  vi.useRealTimers()
})

const listen = (): void => {
  stops.push(listenForHints(document))
}

const hinted = (attributes: Readonly<Record<string, string>>): HTMLElement => {
  const button = document.createElement('button')
  Object.entries(attributes).forEach(([name, value]) => {
    button.setAttribute(name, value)
  })
  button.textContent = 'Play'
  document.body.append(button)
  return button
}

const play = {
  'data-hint': 'Plays from where you stopped',
  'data-hint-keys': 'p k',
}

const fire = (
  target: EventTarget,
  type: string,
  init: EventInit = {},
): void => {
  target.dispatchEvent(new Event(type, { bubbles: true, ...init }))
}

const tooltip = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('.fk-hint')

const isShown = (): boolean => tooltip()?.dataset['shown'] === 'true'

describe('listenForHints', () => {
  it('shows what a control does, and its keys, a moment after the pointer rests on it', () => {
    listen()
    fire(hinted(play), 'pointerover')
    expect(isShown()).toBe(false)
    vi.advanceTimersByTime(hintShowDelayMs)
    expect(isShown()).toBe(true)
    expect(tooltip()?.textContent).toContain('Plays from where you stopped')
    expect(
      Array.from(tooltip()?.querySelectorAll('kbd') ?? []).map(
        key => key.textContent,
      ),
    ).toEqual(['p', 'k'])
  })

  it('shows at once when the keyboard lands on the control', () => {
    listen()
    const button = hinted(play)
    fire(document, 'keydown')
    fire(button, 'focusin')
    expect(isShown()).toBe(true)
  })

  it('hides when the pointer leaves, on Escape, on a press, and when the keyboard moves on', () => {
    listen()
    const button = hinted(play)
    const show = (): void => {
      fire(button, 'pointerover')
      vi.advanceTimersByTime(hintShowDelayMs)
      expect(isShown()).toBe(true)
    }
    show()
    fire(button, 'pointerout')
    expect(isShown()).toBe(false)
    show()
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    expect(isShown()).toBe(false)
    show()
    fire(button, 'pointerdown')
    expect(isShown()).toBe(false)
    show()
    fire(button, 'focusout')
    expect(isShown()).toBe(false)
  })

  it('says why the user would press it, under what it does', () => {
    listen()
    fire(
      hinted({ ...play, 'data-hint-why': 'To go on listening' }),
      'pointerover',
    )
    vi.advanceTimersByTime(hintShowDelayMs)
    const lines = Array.from(
      tooltip()?.querySelector('.fk-hint-text')?.children ?? [],
      line => line.className,
    )
    expect(lines).toEqual(['fk-hint-what', 'fk-hint-why'])
    expect(tooltip()?.querySelector('.fk-hint-why')?.textContent).toBe(
      'To go on listening',
    )
  })

  it('names an icon and says why a control is unavailable', () => {
    listen()
    fire(
      hinted({
        ...play,
        'data-hint-title': 'Play',
        'data-hint-because': 'nothing is loaded',
      }),
      'pointerover',
    )
    vi.advanceTimersByTime(hintShowDelayMs)
    expect(tooltip()?.querySelector('.fk-hint-title')?.textContent).toBe('Play')
    expect(tooltip()?.querySelector('.fk-hint-because')?.textContent).toBe(
      'nothing is loaded',
    )
  })

  it('measures the panel from the page’s start edge each time, so one shown near the far edge before does not push the next against it', () => {
    listen()
    const viewWidth = 390
    vi.stubGlobal('innerWidth', viewWidth)
    const first = hinted(play)
    fire(document, 'keydown')
    fire(first, 'focusin')
    const panel = tooltip()
    if (panel === null) {
      throw new Error('no panel')
    }
    // A panel placed by the page shrinks to the room left of the far edge,
    // as a browser lays it out: 320 wide at most.
    Object.defineProperty(panel, 'offsetWidth', {
      configurable: true,
      get: () =>
        Math.min(320, viewWidth - Number.parseInt(panel.style.left || '0', 10)),
    })
    const near = hinted(play)
    near.getBoundingClientRect = () => new DOMRect(viewWidth - 60, 700, 50, 40)
    fire(first, 'focusout')
    // Where a narrower hint was shown before, part way across.
    panel.style.left = '86px'
    fire(near, 'focusin')
    expect(Number.parseInt(panel.style.left, 10) + 320).toBeLessThanOrEqual(
      viewWidth - 8,
    )
    vi.unstubAllGlobals()
  })

  it('tells one control from another by which element it is, never by reading into the element', () => {
    listen()
    // Elements with a part that cannot be read, as an icon's SVG length
    // cannot before it is laid out.
    const unreadable = (): HTMLElement => {
      const button = hinted(play)
      Object.defineProperty(button, 'unreadable', {
        enumerable: true,
        get: () => {
          throw new Error('read into the element')
        },
      })
      return button
    }
    const first = unreadable()
    const second = unreadable()
    fire(document, 'keydown')
    fire(first, 'focusin')
    expect(isShown()).toBe(true)
    expect(() => {
      fire(second, 'pointerover')
    }).not.toThrow()
  })

  it('stays, and still comes, while something else on the page scrolls, such as words that follow a voice; hides when what holds the control scrolls', () => {
    listen()
    const words = document.createElement('div')
    const dock = document.createElement('div')
    document.body.append(words, dock)
    const button = hinted(play)
    dock.append(button)
    fire(button, 'pointerover')
    fire(words, 'scroll', { bubbles: false })
    vi.advanceTimersByTime(hintShowDelayMs)
    expect(isShown()).toBe(true)
    fire(words, 'scroll', { bubbles: false })
    expect(isShown()).toBe(true)
    fire(dock, 'scroll', { bubbles: false })
    expect(isShown()).toBe(false)
    fire(document, 'keydown')
    fire(button, 'focusin')
    expect(isShown()).toBe(true)
    fire(document, 'scroll', { bubbles: false })
    expect(isShown()).toBe(false)
  })

  it('shows nothing for a control without a hint, and nothing once stopped', () => {
    listen()
    const plain = document.createElement('button')
    document.body.append(plain)
    fire(plain, 'pointerover')
    vi.advanceTimersByTime(hintShowDelayMs)
    expect(isShown()).toBe(false)
    stops.splice(0).forEach(stop => {
      stop()
    })
    fire(hinted(play), 'pointerover')
    vi.advanceTimersByTime(hintShowDelayMs)
    expect(isShown()).toBe(false)
  })

  it('keeps one listener for a document however many painters ask', () => {
    const first = listenForHints(document)
    const second = listenForHints(document)
    first()
    fire(hinted(play), 'pointerover')
    vi.advanceTimersByTime(hintShowDelayMs)
    expect(isShown()).toBe(true)
    second()
    expect(document.querySelectorAll('.fk-hint').length).toBe(0)
  })
})

describe('showEcho', () => {
  it('says for a moment what a key just did, to the eye and to a screen reader', () => {
    showEcho(document, {
      title: 'Play title',
      maybeNote: Option.none(),
      keys: ['p'],
    })
    const echo = document.querySelector<HTMLElement>('.fk-echo')
    expect(echo?.getAttribute('role')).toBe('status')
    expect(echo?.textContent).toContain('Play title')
    expect(echo?.dataset['shown']).toBe('true')
    vi.advanceTimersByTime(5_000)
    expect(echo?.dataset['shown']).toBe('false')
  })
})
