import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { Transcript } from './elements.js'
import { paintHtml } from './html.js'
import { placeWordMenu, transcriptMount, wordMenuMount } from './htmlEdge.js'

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
  it('asks for the menu on a right click on a word, where the Transcript offers one', () => {
    const words = classed(paintedTree(false), 'fk-word')
    expect(words).toHaveLength(2)
    expect(
      words.every(word => typeof word.data?.on?.['contextmenu'] === 'function'),
    ).toBe(true)
    expect(classed(paintedTree(false), 'fk-word-menu')).toHaveLength(0)
  })

  it('draws the menu the Program holds open: its items, and a backdrop that closes it', () => {
    const tree = paintedTree(true)
    const html = JSON.stringify(tree)
    expect(classed(tree, 'fk-word-menu')).toHaveLength(1)
    expect(classed(tree, 'fk-word-menu-backdrop')).toHaveLength(1)
    expect(
      classed(tree, 'fk-word-menu-item').map(item =>
        (item.children ?? [])
          .filter(child => typeof child === 'string')
          .join(''),
      ),
    ).toEqual(['Play from here', 'Copy link to this word'])
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

  it('opens the menu on a long press with a finger, as a right click does, and not after the finger moves', async () => {
    const transcript = document.createElement('section')
    transcript.setAttribute('data-word-menu', 'true')
    const word = document.createElement('span')
    word.className = 'fk-word'
    word.setAttribute('data-token', 'w2')
    transcript.append(word)
    document.body.append(transcript)
    const asked: Array<string> = []
    word.addEventListener('contextmenu', () => asked.push('w2'))
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
    await new Promise(resolve => {
      setTimeout(resolve, 650)
    })
    expect(asked).toEqual([])
    pointer('pointerdown', 10)
    await until(() => asked.length === 1)
    expect(asked).toEqual(['w2'])
    await Effect.runPromise(Fiber.interrupt(fiber))
    transcript.remove()
  })
})
