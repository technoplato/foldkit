import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { List } from './elements.js'
import { paintHtml } from './html.js'
import { itemMenuMount, listMount, placeItemMenu } from './htmlEdge.js'

// Made-up books: nothing here is a real title.
const shelf = (isOpen: boolean) =>
  List({
    label: 'No audio yet',
    items: [
      {
        key: 'salt-road',
        title: 'Salt Road',
        action: 'Open:salt-road',
        menuAction: 'ShowTitleMenu:salt-road',
      },
      { key: 'a-tin-comet', title: 'A Tin Comet', action: 'Open:a-tin-comet' },
    ],
    ...(isOpen
      ? {
          menu: {
            key: 'salt-road',
            dismissAction: 'CloseTitleMenu',
            items: [
              { action: 'Open:salt-road', label: 'Open' },
              {
                action: 'ImportFromAudible',
                label: 'Get its audio from Audible',
              },
            ],
          },
        }
      : {}),
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

const labelOf = (node: Vnode): string =>
  node.text ??
  (node.children ?? [])
    .map(child => (typeof child === 'string' ? child : (child.text ?? '')))
    .join('')

const paintedTree = (isOpen: boolean): Vnode =>
  // NOTE: the painter returns the library's own element tree, read here
  // as plain data.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  paintHtml(shelf(isOpen), tag => tag) as unknown as Vnode

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

describe('a row’s menu in the Foldkit HTML painter', () => {
  it('asks for the menu on a right click on a row that has one, and on no other', () => {
    const rows = classed(paintedTree(false), 'fk-item')
    expect(
      rows.map(row => typeof row.data?.on?.['contextmenu'] === 'function'),
    ).toEqual([true, false])
    expect(classed(paintedTree(false), 'fk-word-menu')).toHaveLength(0)
  })

  it('draws the menu the Program holds open, named for its row', () => {
    const tree = paintedTree(true)
    expect(classed(tree, 'fk-word-menu-backdrop')).toHaveLength(1)
    expect(classed(tree, 'fk-word-menu-item').map(labelOf)).toEqual([
      'Open',
      'Get its audio from Audible',
    ])
    expect(JSON.stringify(classed(tree, 'fk-word-menu'))).toContain('Salt Road')
  })
})

describe('the row menu at the edge', () => {
  const listWithRow = () => {
    const list = document.createElement('ul')
    list.className = 'fk-list'
    const row = document.createElement('li')
    row.className = 'fk-item'
    row.setAttribute('data-key', 'salt-road')
    row.setAttribute('data-menu', 'true')
    list.append(row)
    document.body.append(list)
    return { list, row }
  }

  it('is put by its row, and closes on Escape by telling the Program', async () => {
    const { list } = listWithRow()
    const menu = document.createElement('div')
    list.append(menu)
    placeItemMenu(menu, 'salt-road')
    expect(menu.style.top).toMatch(/px$/)
    const told: Array<string> = []
    const fiber = Effect.runFork(
      Stream.runForEach(
        itemMenuMount('salt-road', 'CloseTitleMenu').f(menu),
        message => Effect.sync(() => told.push(message)),
      ),
    )
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await until(() => told.length === 1)
    expect(told).toEqual(['CloseTitleMenu'])
    await Effect.runPromise(Fiber.interrupt(fiber))
    list.remove()
  })

  it('opens the menu on a long press with a finger, as a right click does', async () => {
    const { list, row } = listWithRow()
    const asked: Array<string> = []
    row.addEventListener('contextmenu', () => asked.push('salt-road'))
    const fiber = Effect.runFork(Stream.runDrain(listMount<never>().f(list)))
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    row.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerType: 'touch',
        clientX: 10,
        clientY: 10,
      }),
    )
    await until(() => asked.length === 1)
    expect(asked).toEqual(['salt-road'])
    await Effect.runPromise(Fiber.interrupt(fiber))
    list.remove()
  })
})
