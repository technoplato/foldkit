import { Option } from 'effect'
import { DragAndDrop } from 'foldkit/behavior'
import { DragAndDropFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core DragAndDrop Part on the React painter through the
// existing generic React host (`paintReact/host.tsx`), with zero
// DragAndDrop-specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (
  overrides: Partial<DragAndDrop.Props> = {},
  options: DragAndDropFixture.FixtureOptions = {},
) => {
  const fixture = DragAndDropFixture.start(overrides, options)
  const painted = () =>
    paintTree(fixture.tree(), {
      onPress: button => {
        const tag = button.action ?? button.token
        if (tag !== undefined) {
          fixture.press(tag)
        }
      },
    })
  const view = render(painted())
  const repaint = (): void => {
    act(() => {
      view.rerender(painted())
    })
  }
  const elementWith = (selector: string): HTMLElement => {
    const found = view.container.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    throw new Error(`the painted dragAndDrop fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core DragAndDrop Part on the React generic host', () => {
  it('projects Draggable, Droppable, and LiveRegion ARIA and drives keyboard and pointer drag lifecycles', () => {
    const staged = stage()

    const task1 = staged.elementWith('#fixture-dnd-item-task-1')
    const todo = staged.elementWith('#fixture-dnd-container-todo')
    const live = staged.elementWith('#fixture-dnd-live')

    expect(task1.getAttribute('role')).toBe('button')
    expect(task1.getAttribute('aria-pressed')).toBe('false')
    expect(task1.getAttribute('aria-describedby')).toBe('fixture-dnd-live')
    expect(todo.getAttribute('role')).toBe('region')
    expect(todo.getAttribute('aria-current')).toBe('false')
    expect(live.getAttribute('role')).toBe('status')
    expect(live.getAttribute('aria-live')).toBe('assertive')
    expect(live.getAttribute('aria-atomic')).toBe('true')

    // Click lifts task-1
    fireEvent.click(task1)
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-dnd-item-task-1')
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-dnd-container-todo')
        .getAttribute('aria-current'),
    ).toBe('true')
    expect(staged.elementWith('#fixture-dnd-live').textContent).toContain(
      'Lifted Write tests at position 1 of 2 in To Do.',
    )

    // Move across containers and drop
    staged.fixture.send(
      DragAndDrop.MoveDraggedItem({ direction: 'NextContainer' }),
    )
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-dnd-container-done')
        .getAttribute('aria-current'),
    ).toBe('true')
    expect(staged.elementWith('#fixture-dnd-live').textContent).toBe(
      'Moved Write tests to position 1 of 2 in Done.',
    )

    staged.fixture.press(DragAndDrop.DropItem.tag)
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-dnd-item-task-1')
        .getAttribute('aria-pressed'),
    ).toBe('false')
    expect(staged.elementWith('#fixture-dnd-live').textContent).toBe(
      'Dropped Write tests at position 1 of 2 in Done.',
    )

    // Pointer drag move + Escape cancel restores origin
    staged.fixture.send(
      DragAndDrop.BeginPointerDrag({
        itemId: 'task-2',
        pointerId: 4,
        x: 10,
        y: 10,
      }),
    )
    staged.fixture.send(
      DragAndDrop.MovePointerDrag({
        pointerId: 4,
        x: 25,
        y: 10,
        maybeDropTarget: Option.some({ containerId: 'done', index: 0 }),
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

  it('projects disabled ARIA and blocks drag activation when disabled', () => {
    const disabled = stage({ isDisabled: true })
    expect(
      disabled
        .elementWith('#fixture-dnd-item-task-1')
        .getAttribute('aria-disabled'),
    ).toBe('true')
    disabled.fixture.send(DragAndDrop.LiftItem({ itemId: 'task-1' }))
    disabled.repaint()
    expect(DragAndDrop.isIdle(disabled.fixture.dragAndDropState())).toBe(true)
    expect(
      disabled
        .elementWith('#fixture-dnd-item-task-1')
        .getAttribute('aria-pressed'),
    ).toBe('false')
  })
})
