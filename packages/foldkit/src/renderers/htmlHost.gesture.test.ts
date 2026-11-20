import { Array, Effect, Fiber, Option, Stream } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Host from '../behavior/host.js'
import * as LongPress from '../behavior/longPress.js'
import * as Slot from '../behavior/slot.js'
import * as Shelf from '../test/shelf.js'
import { paintHtml } from './html.js'
import { recognizes, slotHostMount, slotPressEventName } from './htmlHost.js'
import type { UiNode } from './types.js'

// NOTE: this is the HTML painter's driver of the gesture test every
// painter runs. It paints the made-up shelf with the HTML painter, puts
// what it painted on a page, runs the painter's own mount, and does what a
// person does with the browser's events. The table of acts and the shelf
// are shared with the React and the phone drivers; only the events differ.

type Vnode = Readonly<{
  sel?: string
  data?: Readonly<{
    attrs?: Readonly<Record<string, string | number | boolean>>
    class?: Readonly<Record<string, boolean>>
  }>
  children?: ReadonlyArray<Vnode | string>
  text?: string
}>

const paintedOf = (tree: UiNode): Vnode =>
  // NOTE: the painter returns the library's own element tree, read here
  // as plain data.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  paintHtml(tree, tag => tag) as unknown as Vnode

const elementOf = (node: Vnode): HTMLElement => {
  const tag = Option.getOrElse(
    Array.head((node.sel ?? 'div').split(/[.#]/u)),
    () => 'div',
  )
  const element = document.createElement(tag === '' ? 'div' : tag)
  Object.entries(node.data?.attrs ?? {}).forEach(([name, value]) => {
    element.setAttribute(name, String(value))
  })
  Object.entries(node.data?.class ?? {}).forEach(([name, isOn]) => {
    if (isOn) {
      element.classList.add(name)
    }
  })
  ;(node.children ?? []).forEach(child => {
    element.append(typeof child === 'string' ? child : elementOf(child))
  })
  if (node.text !== undefined) {
    element.append(node.text)
  }
  return element
}

const vnodesOf = (node: Vnode | string): ReadonlyArray<Vnode> =>
  typeof node === 'string'
    ? []
    : [node, ...(node.children ?? []).flatMap(vnodesOf)]

const holdAttributes = ['data-hold-count', 'data-hold-press']

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 5)
  })

const stage = async () => {
  const shelf = Shelf.start()
  const page = elementOf(paintedOf(shelf.tree()))
  document.body.append(page)
  const elementWith = (selector: string): HTMLElement => {
    const maybeElement = page.querySelector(selector)
    if (maybeElement instanceof HTMLElement) {
      return maybeElement
    }
    throw new Error(`the painted shelf has no ${selector}`)
  }
  const list = elementWith('ul.fk-list')
  const pin = elementWith('button.fk-button')
  const row = elementWith('li.fk-item[data-key="salt-road"]')
  const rowPress = elementWith(
    'li.fk-item[data-key="salt-road"] .fk-item-press',
  )
  const syncHold = (): void => {
    const painted = vnodesOf(paintedOf(shelf.tree()))
    const attrsOf = (isIt: (node: Vnode) => boolean) =>
      Option.match(Array.findFirst(painted, isIt), {
        onNone: () => ({}),
        onSome: node => node.data?.attrs ?? {},
      })
    const apply = (
      element: HTMLElement,
      attrs: Readonly<Record<string, string | number | boolean>>,
    ): void => {
      holdAttributes.forEach(name => {
        const value = attrs[name]
        if (value === undefined) {
          element.removeAttribute(name)
        } else if (element.getAttribute(name) !== String(value)) {
          element.setAttribute(name, String(value))
        }
      })
    }
    apply(
      list,
      attrsOf(node => node.data?.class?.['fk-list'] === true),
    )
    apply(
      pin,
      attrsOf(node => node.data?.class?.['fk-button'] === true),
    )
  }
  const clicked: Array<string> = []
  rowPress.addEventListener('click', () => clicked.push('Open:salt-road'))
  const hosts = Array.map([list, pin], element => {
    element.addEventListener(slotPressEventName, event => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        shelf.press(event.detail)
        syncHold()
      }
    })
    return Effect.runFork(Stream.runDrain(slotHostMount<never>().f(element)))
  })
  await tick()
  await tick()
  const pointer = (
    target: HTMLElement,
    type: string,
    x: number,
    pointerType = 'touch',
  ): void => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerType,
        clientX: x,
        clientY: 10,
      }),
    )
  }
  const elapse = async (ms: number): Promise<void> => {
    await shelf.elapse(ms)
    syncHold()
    await tick()
  }
  const strike = async (): Promise<void> => {
    await Effect.runPromise(
      Effect.forEach(hosts, host => Fiber.interrupt(host)),
    )
    page.remove()
  }
  return { shelf, list, pin, row, rowPress, clicked, pointer, elapse, strike }
}

type Stage = Awaited<ReturnType<typeof stage>>

const act = async (
  staged: Stage,
  target: HTMLElement,
  personAct: Host.PersonAct,
): Promise<void> => {
  if (personAct === 'Hold') {
    staged.pointer(target, 'pointerdown', 10)
    await staged.elapse(LongPress.holdMs)
    staged.pointer(target, 'pointerup', 10)
  } else {
    target.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    )
  }
}

const struck: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(struck.splice(0).map(strike => strike()))
})

const staged = async (): Promise<Stage> => {
  const made = await stage()
  struck.push(made.strike)
  return made
}

describe('the gesture test, on the HTML painter', () => {
  it('hears every gesture the menu’s row listens for', () => {
    expect(
      Host.unheard(Slot.menuAsk('ShowTitleMenu:salt-road'), recognizes),
    ).toEqual([])
  })

  it.each(Host.personActs)(
    '%s on a title’s row opens that title’s menu',
    async personAct => {
      const made = await staged()
      await act(made, made.row, personAct)
      expect(made.shelf.model().parts['TitleMenu']).toEqual(
        Shelf.OpenOn({ key: 'salt-road' }),
      )
      expect(Shelf.actionsOf(made.shelf)).toEqual(['ShowTitleMenu'])
    },
  )

  it.each(Host.personActs)(
    '%s on a second part, bound on a button, does that part’s Action, with no painter code naming it',
    async personAct => {
      const made = await staged()
      await act(made, made.pin, personAct)
      expect(made.shelf.model().parts['Pin']).toEqual(Shelf.Pinned())
      expect(Shelf.actionsOf(made.shelf)).toEqual(['TogglePin'])
    },
  )

  it('opens nothing when the finger moves off the spot, or lifts early', async () => {
    const made = await staged()
    made.pointer(made.row, 'pointerdown', 10)
    made.pointer(made.row, 'pointermove', 60)
    await made.elapse(LongPress.holdMs)
    made.pointer(made.row, 'pointerup', 60)
    made.pointer(made.row, 'pointerdown', 10)
    await made.elapse(LongPress.holdMs - 100)
    made.pointer(made.row, 'pointerup', 10)
    await made.elapse(LongPress.holdMs)
    expect(Shelf.actionsOf(made.shelf)).toEqual([])
    expect(made.shelf.model().parts['TitleMenu']).toEqual(Shelf.Closed())
  })

  it('does not hold with a mouse, which asks with its second button', async () => {
    const made = await staged()
    made.pointer(made.row, 'pointerdown', 10, 'mouse')
    await made.elapse(LongPress.holdMs)
    expect(made.shelf.folded()).toEqual([])
  })

  it('does not cut a hold short with the wait of a tap that came just before it', async () => {
    const made = await staged()
    made.pointer(made.row, 'pointerdown', 10)
    await made.elapse(80)
    made.pointer(made.row, 'pointerup', 10)
    await made.elapse(220)
    made.pointer(made.row, 'pointerdown', 10)
    await made.elapse(200)
    expect(Shelf.actionsOf(made.shelf)).toEqual([])
    await made.elapse(LongPress.holdMs - 200)
    expect(Shelf.actionsOf(made.shelf)).toEqual(['ShowTitleMenu'])
  })

  it('stops the tap that ends a hold, so the row is not also opened, and stops no tap after it', async () => {
    const made = await staged()
    await act(made, made.row, 'Hold')
    made.rowPress.click()
    await tick()
    expect(made.clicked).toEqual([])
    expect(made.shelf.model().parts['hold']).toEqual(
      LongPress.Idle({ pressCount: 1 }),
    )
    await made.elapse(0)
    made.rowPress.click()
    expect(made.clicked).toEqual(['Open:salt-road'])
  })

  it('stops no later tap when the browser sent none for the hold', async () => {
    const made = await staged()
    await act(made, made.row, 'Hold')
    await made.elapse(LongPress.swallowMs)
    made.rowPress.click()
    expect(made.clicked).toEqual(['Open:salt-road'])
  })
})
