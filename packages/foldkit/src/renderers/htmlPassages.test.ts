import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { Transcript } from './elements.js'
import { paintHtml } from './html.js'
import {
  placePassageMenu,
  transcriptMount,
  transcriptPressEventName,
  transcriptPressOf,
} from './htmlEdge.js'
import { renderScreen } from './render.js'

// Made-up words: nothing here is from a real recording or book.
const passages = Transcript({
  label: 'Words',
  action: 'SeekToWord',
  emptyText: 'No words yet.',
  passages: [
    {
      key: 'p1',
      label: '0:00',
      labelAction: 'OpenSectionMenu:p1',
      startMs: 0,
      isFocused: true,
      words: [{ token: 'w1', text: 'Lanterns', startMs: 400 }],
    },
    {
      key: 'p2',
      label: '0:05',
      startMs: 5000,
      isTentative: true,
      words: [{ token: 'w2', text: 'drifting', startMs: 5200 }],
    },
    { key: 'p3', label: '0:09', text: 'over the harbor', words: [] },
    { key: 'p4', label: '0:12', sealed: 'Words kept private', words: [] },
  ],
  passageMenu: {
    key: 'p1',
    dismissAction: 'CloseSectionMenu',
    items: [{ action: 'CopySectionText:p1', label: 'Copy Text' }],
  },
})

const painted = (): string =>
  JSON.stringify(paintHtml(passages, press => press))

describe('passages in the Foldkit HTML painter', () => {
  it('says where each passage starts, and which is focused or still being heard', () => {
    const html = painted()
    expect(html).toContain('"data-key":"p2"')
    expect(html).toContain('"data-start-ms":"5000"')
    expect(html).toContain('"data-focused":"true"')
    expect(html).toContain('"data-tentative":"true"')
  })

  it('draws a passage with no timed words as its text, and a sealed one as a quiet placeholder that names why', () => {
    const html = painted()
    expect(html).toContain('over the harbor')
    expect(html).toContain('fk-passage-sealed')
    expect(html).toContain('Words kept private')
    expect(html).toContain('fk-sealed-bar')
  })

  it('makes a passage’s time a button that names its press, and draws the passage menu the Program holds open', () => {
    const html = painted()
    expect(html).toContain('"data-press":"OpenSectionMenu:p1"')
    expect(html).toContain('Section at 0:00')
    expect(html).toContain('Copy Text')
  })
})

describe('presses at the edge of a painted Transcript', () => {
  const transcriptElement = () => {
    const transcript = document.createElement('section')
    transcript.setAttribute('data-word-action', 'SeekToWord')
    transcript.setAttribute('data-word-menu-action', 'ShowWordMenu')
    const word = document.createElement('span')
    word.className = 'fk-word'
    word.setAttribute('data-token', 'w4012')
    const label = document.createElement('button')
    label.className = 'fk-passage-label'
    label.setAttribute('data-press', 'OpenSectionMenu:p7')
    transcript.append(word, label)
    return { transcript, word, label }
  }

  it('reads a word’s press, its menu press and a part’s own press', () => {
    const { transcript, word, label } = transcriptElement()
    expect(transcriptPressOf(transcript, word, 'Click')).toBe(
      'SeekToWord:w4012',
    )
    expect(transcriptPressOf(transcript, word, 'Menu')).toBe(
      'ShowWordMenu:w4012',
    )
    expect(transcriptPressOf(transcript, label, 'Click')).toBe(
      'OpenSectionMenu:p7',
    )
    expect(transcriptPressOf(transcript, transcript, 'Click')).toBeUndefined()
  })

  it('tells the view each press with one listener, and leaves a click that ends a selection alone', async () => {
    const { transcript, word, label } = transcriptElement()
    document.body.append(transcript)
    const told: Array<string> = []
    transcript.addEventListener(transcriptPressEventName, event => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        told.push(event.detail)
      }
    })
    const fiber = Effect.runFork(
      Stream.runDrain(transcriptMount<never>().f(transcript)),
    )
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    word.click()
    label.click()
    word.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    )
    expect(told).toEqual([
      'SeekToWord:w4012',
      'OpenSectionMenu:p7',
      'ShowWordMenu:w4012',
    ])
    word.textContent = 'harbor '
    const range = document.createRange()
    range.selectNodeContents(word)
    window.getSelection()?.addRange(range)
    word.click()
    expect(told).toHaveLength(3)
    window.getSelection()?.removeAllRanges()
    await Effect.runPromise(Fiber.interrupt(fiber))
    transcript.remove()
  })

  it('puts a passage menu by its passage’s time', () => {
    const transcript = document.createElement('section')
    transcript.className = 'fk-transcript'
    const passage = document.createElement('article')
    passage.className = 'fk-passage'
    passage.setAttribute('data-key', 'p7')
    const label = document.createElement('span')
    label.className = 'fk-passage-label'
    label.textContent = '0:42'
    passage.append(label)
    const menu = document.createElement('div')
    transcript.append(passage, menu)
    document.body.append(transcript)
    placePassageMenu(menu, 'p7')
    expect(menu.style.left).toMatch(/px$/)
    expect(menu.getAttribute('aria-label')).toBe('0:42')
    transcript.remove()
  })
})

describe('passages in a terminal', () => {
  it('prints why a sealed passage’s words are held back, and a passage’s text where it has no timed words', () => {
    const screen = renderScreen(passages, 60)
    expect(screen).toContain('Words kept private')
    expect(screen).toContain('over the harbor')
    expect(screen).toContain('drifting')
  })
})
