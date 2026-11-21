import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as DragAndDrop from '../behavior/dragAndDrop.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as DragAndDropFixture from '../test/dragAndDropFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core DragAndDrop Part on the HTML painter through the
// existing generic `htmlHost` (`slotAttributesOf`), with zero
// DragAndDrop-specific painter logic.

type Vnode = Readonly<{
  sel?: string
  data?: Readonly<{
    attrs?: Readonly<Record<string, string | number | boolean>>
    class?: Readonly<Record<string, boolean>>
    on?: Readonly<Record<string, unknown>>
  }>
  children?: ReadonlyArray<Vnode | string>
  text?: string
}>

const paintedOf = (tree: UiNode, onAction: (tag: string) => void): Vnode => {
  setHtmlRuntime(message => {
    if (typeof message === 'string') {
      onAction(message)
    }
  }, Context.empty())
  try {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return paintHtml(tree, tag => tag) as unknown as Vnode
  } finally {
    clearHtmlRuntime()
  }
}

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
  const clickHandler = node.data?.on?.['click']
  if (typeof clickHandler === 'function') {
    element.addEventListener('click', event => {
      clickHandler(event)
    })
  }
  ;(node.children ?? []).forEach(child => {
    element.append(typeof child === 'string' ? child : elementOf(child))
  })
  if (node.text !== undefined) {
    element.append(node.text)
  }
  return element
}

const roots: Array<HTMLElement> = []

afterEach(() => {
  roots.splice(0).forEach(root => root.remove())
})

const stage = (
  overrides: Partial<DragAndDrop.Props> = {},
  options: DragAndDropFixture.FixtureOptions = {},
) => {
  const fixture = DragAndDropFixture.start(overrides, options)
  const root = document.createElement('div')
  document.body.append(root)
  roots.push(root)

  const repaint = (): void => {
    root.replaceChildren(elementOf(paintedOf(fixture.tree(), fixture.press)))
  }
  repaint()

  const elementWith = (selector: string): HTMLElement => {
    const found = root.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    throw new Error(`the painted dragAndDrop fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('core DragAndDrop Part on the HTML generic host', () => {
  it('projects Draggable, Droppable, and LiveRegion ARIA through generic slot attributes across keyboard lift, move, drop, and cancel', () => {
    const staged = stage()

    const todo = staged.elementWith('#fixture-dnd-container-todo')
    const done = staged.elementWith('#fixture-dnd-container-done')
    const task1 = staged.elementWith('#fixture-dnd-item-task-1')
    const task2 = staged.elementWith('#fixture-dnd-item-task-2')
    const live = staged.elementWith('#fixture-dnd-live')

    expect(todo.getAttribute('role')).toBe('region')
    expect(todo.getAttribute('aria-current')).toBe('false')
    expect(todo.getAttribute('aria-orientation')).toBe('vertical')
    expect(done.getAttribute('role')).toBe('region')
    expect(done.getAttribute('aria-current')).toBe('false')

    expect(task1.getAttribute('role')).toBe('button')
    expect(task1.getAttribute('aria-pressed')).toBe('false')
    expect(task1.getAttribute('aria-describedby')).toBe('fixture-dnd-live')
    expect(task1.getAttribute('tabindex')).toBe('0')

    expect(live.getAttribute('role')).toBe('status')
    expect(live.getAttribute('aria-live')).toBe('assertive')
    expect(live.getAttribute('aria-atomic')).toBe('true')
    expect(live.textContent).toBe('')

    // Clicking draggable lifts task-1 through generic Catalog press token
    task1.click()
    staged.repaint()

    expect(
      staged
        .elementWith('#fixture-dnd-item-task-1')
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-dnd-item-task-2')
        .getAttribute('aria-pressed'),
    ).toBe('false')
    expect(
      staged
        .elementWith('#fixture-dnd-container-todo')
        .getAttribute('aria-current'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-dnd-container-done')
        .getAttribute('aria-current'),
    ).toBe('false')
    expect(staged.elementWith('#fixture-dnd-live').textContent).toContain(
      'Lifted Write tests at position 1 of 2 in To Do.',
    )
    expect(task2.getAttribute('aria-pressed')).toBe('false')

    // ArrowRight moves across containers into Done
    staged.fixture.send(DragAndDrop.PressedDragKey({ key: 'ArrowRight' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-dnd-container-todo')
        .getAttribute('aria-current'),
    ).toBe('false')
    expect(
      staged
        .elementWith('#fixture-dnd-container-done')
        .getAttribute('aria-current'),
    ).toBe('true')
    expect(staged.elementWith('#fixture-dnd-live').textContent).toBe(
      'Moved Write tests to position 1 of 2 in Done.',
    )

    // Space commits drop
    staged.fixture.send(DragAndDrop.PressedDragKey({ key: ' ' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-dnd-item-task-1')
        .getAttribute('aria-pressed'),
    ).toBe('false')
    expect(
      staged
        .elementWith('#fixture-dnd-container-done')
        .getAttribute('aria-current'),
    ).toBe('false')
    expect(staged.elementWith('#fixture-dnd-live').textContent).toBe(
      'Dropped Write tests at position 1 of 2 in Done.',
    )

    // Pointer drag crossing threshold updates pressed/current, Escape cancels
    staged.fixture.send(
      DragAndDrop.BeginPointerDrag({
        itemId: 'task-2',
        pointerId: 1,
        x: 50,
        y: 50,
      }),
    )
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-dnd-item-task-2')
        .getAttribute('aria-pressed'),
    ).toBe('false')

    staged.fixture.send(
      DragAndDrop.MovePointerDrag({
        pointerId: 1,
        x: 60,
        y: 50,
        maybeDropTarget: Option.some({ containerId: 'done', index: 1 }),
      }),
    )
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-dnd-item-task-2')
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-dnd-container-done')
        .getAttribute('aria-current'),
    ).toBe('true')

    staged.fixture.send(DragAndDrop.PressedDragKey({ key: 'Escape' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-dnd-item-task-2')
        .getAttribute('aria-pressed'),
    ).toBe('false')
    expect(staged.elementWith('#fixture-dnd-live').textContent).toBe(
      'Cancelled dragging Build core. Returned to position 2 of 2 in To Do.',
    )
  })

  it('projects disabled ARIA on disabled items and blocks lifts', () => {
    const disabled = stage({
      items: [
        { id: 'task-1', label: 'Write tests', isDisabled: true },
        { id: 'task-2', label: 'Build core' },
        { id: 'task-3', label: 'Ship release' },
      ],
    })
    const locked = disabled.elementWith('#fixture-dnd-item-task-1')
    expect(locked.getAttribute('aria-disabled')).toBe('true')
    expect(locked.getAttribute('tabindex')).toBe('-1')

    disabled.fixture.press('LiftItem:task-1')
    disabled.repaint()
    expect(DragAndDrop.isIdle(disabled.fixture.dragAndDropState())).toBe(true)
    expect(
      disabled
        .elementWith('#fixture-dnd-item-task-1')
        .getAttribute('aria-pressed'),
    ).toBe('false')
  })
})
