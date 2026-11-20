import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Slot from '../behavior/slot.js'
import { Transcript } from './elements.js'
import { paintHtml } from './html.js'
import {
  placeWordMenu,
  transcriptMount,
  transcriptPressEventName,
  wordMenuMount,
} from './htmlEdge.js'
import { slotAttributesOf } from './htmlHost.js'

// Made-up words: nothing here is from a real recording or book.
const withMenu = (isOpen: boolean) =>
  Transcript({
    label: 'Words',
    action: 'SeekToWord',
    emptyText: 'No words yet.',
    wordMenuAction: 'ShowWordMenu',
    ...(isOpen
      ? {
          wordMenu: {
            token: 'w2',
            dismissAction: 'CloseWordMenu',
            items: [
              { action: 'PlayFrom:w2', label: 'Play from here' },
              { action: 'CopyWordLink:w2', label: 'Copy link to this word' },
            ],
          },
        }
      : {}),
    passages: [
      {
        key: 'p1',
        label: '0:00',
        words: [
          { token: 'w1', text: 'The', startMs: 400 },
          { token: 'w2', text: 'keeper', startMs: 900, mark: 'Picked' },
        ],
      },
    ],
  })

type Vnode = Readonly<{
  sel?: string
  data?: Readonly<{
    class?: Readonly<Record<string, boolean>>
    on?: Readonly<Record<string, unknown>>
  }>
  children?: ReadonlyArray<Vnode | string>
  text?: string
}>

const vnodesOf = (node: Vnode | string): ReadonlyArray<Vnode> =>
  typeof node === 'string'
    ? []
    : [node, ...(node.children ?? []).flatMap(vnodesOf)]

const classed = (root: Vnode, name: string): ReadonlyArray<Vnode> =>
  vnodesOf(root).filter(node => node.data?.class?.[name] === true)

/** The words an element shows: its own text, or its text children joined. */
const labelOf = (node: Vnode): string =>
  node.text ??
  (node.children ?? [])
    .map(child => (typeof child === 'string' ? child : (child.text ?? '')))
    .join('')

const paintedTree = (isOpen: boolean): Vnode =>
  // NOTE: the painter returns the library's own element tree, read here
  // as plain data.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  paintHtml(withMenu(isOpen), tag => tag) as unknown as Vnode

const until = async (isSo: () => boolean): Promise<void> => {
  const tries = Array.from({ length: 400 })
  for (const _ of tries) {
    if (isSo()) {
      return
    }
    await new Promise(resolve => {
      setTimeout(resolve, 5)
    })
  }
}

describe('a word’s menu in the Foldkit HTML painter', () => {
  it('names the word menu press on the Transcript, and gives no word a handler of its own', () => {
    const tree = paintedTree(false)
    const words = classed(tree, 'fk-word')
    expect(words).toHaveLength(2)
    expect(words.every(word => word.data?.on === undefined)).toBe(true)
    expect(JSON.stringify(tree)).toContain(
      '"data-word-menu-action":"ShowWordMenu"',
    )
    expect(typeof tree.data?.on?.[transcriptPressEventName]).toBe('function')
    expect(classed(tree, 'fk-word-menu')).toHaveLength(0)
  })

  it('draws the menu the Program holds open: its items, and a backdrop that closes it', () => {
    const tree = paintedTree(true)
    const html = JSON.stringify(tree)
    expect(classed(tree, 'fk-word-menu')).toHaveLength(1)
    expect(classed(tree, 'fk-word-menu-backdrop')).toHaveLength(1)
    expect(classed(tree, 'fk-word-menu-item').map(labelOf)).toEqual([
      'Play from here',
      'Copy link to this word',
    ])
    expect(html).toContain('"role":"menu"')
    expect(
      classed(tree, 'fk-word-menu-item').every(
        item => typeof item.data?.on?.['click'] === 'function',
      ),
    ).toBe(true)
  })
})

describe('the menu at the edge', () => {
  it('is put by its word, inside the window', () => {
    const transcript = document.createElement('section')
    const word = document.createElement('span')
    word.setAttribute('data-token', 'w2')
    word.textContent = 'keeper '
    const menu = document.createElement('div')
    transcript.append(word, menu)
    document.body.append(transcript)
    placeWordMenu(menu, 'w2')
    expect(menu.style.left).toMatch(/px$/)
    expect(menu.style.top).toMatch(/px$/)
    expect(menu.getAttribute('aria-label')).toBe('keeper')
    transcript.remove()
  })

  it('closes on Escape by telling the Program, and stops listening when unmounted', async () => {
    const transcript = document.createElement('section')
    const word = document.createElement('span')
    word.setAttribute('data-token', 'w2')
    const menu = document.createElement('div')
    transcript.append(word, menu)
    document.body.append(transcript)
    const told: Array<string> = []
    const fiber = Effect.runFork(
      Stream.runForEach(wordMenuMount('w2', 'CloseWordMenu').f(menu), message =>
        Effect.sync(() => told.push(message)),
      ),
    )
    await until(() => menu.style.left !== '')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await until(() => told.length === 1)
    expect(told).toEqual(['CloseWordMenu'])
    await Effect.runPromise(Fiber.interrupt(fiber))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await new Promise(resolve => {
      setTimeout(resolve, 30)
    })
    expect(told).toEqual(['CloseWordMenu'])
    transcript.remove()
  })

  it('tells a hold on a word to core’s rule, sends the hold’s press when the Transcript says it completed, and not after the finger moves', async () => {
    const transcript = document.createElement('section')
    slotAttributesOf(Slot.menuAsk('ShowWordMenu'), 'data-token').forEach(
      ([name, value]) => {
        transcript.setAttribute(name, value)
      },
    )
    const word = document.createElement('span')
    word.className = 'fk-word'
    word.setAttribute('data-token', 'w2')
    transcript.append(word)
    document.body.append(transcript)
    const pressed: Array<string> = []
    transcript.addEventListener(transcriptPressEventName, event => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        pressed.push(event.detail)
      }
    })
    const fiber = Effect.runFork(
      Stream.runDrain(transcriptMount<never>().f(transcript)),
    )
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    const pointer = (type: string, x: number) =>
      word.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerType: 'touch',
          clientX: x,
          clientY: 10,
        }),
      )
    pointer('pointerdown', 10)
    pointer('pointermove', 60)
    pointer('pointermove', 90)
    pointer('pointerup', 90)
    expect(pressed).toEqual([
      'fk-hold-down:ShowWordMenu:w2',
      'fk-hold-away',
      'fk-hold-up',
    ])
    pointer('pointerdown', 10)
    transcript.setAttribute('data-hold-count', '2')
    transcript.setAttribute('data-hold-press', 'ShowWordMenu:w2')
    await until(() => pressed.length === 5)
    expect(pressed.slice(3)).toEqual([
      'fk-hold-down:ShowWordMenu:w2',
      'ShowWordMenu:w2',
    ])
    await Effect.runPromise(Fiber.interrupt(fiber))
    transcript.remove()
  })
})
