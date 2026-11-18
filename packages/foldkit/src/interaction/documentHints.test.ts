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
