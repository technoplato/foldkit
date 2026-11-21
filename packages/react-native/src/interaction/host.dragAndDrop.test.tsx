import { Option } from 'effect'
import { DragAndDrop } from 'foldkit/behavior'
import type { ButtonNode } from 'foldkit/renderers'
import { DragAndDropFixture } from 'foldkit/test'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  callProp,
  firstOf,
  hostsOf,
  propsOf,
  wordsOf,
} from '../test/elements.js'
import { paintTree } from './screen.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('react-native-svg', async () => (await import('../test/native.js')).svg)
vi.mock('../theme/themed.js', async () => {
  const { lightLook: look } = await import('./look.js')
  return { useLook: () => look }
})

// NOTE: proves the core DragAndDrop Part on the React Native painter through
// the existing generic RN host (`interaction/host.ts`), with zero
// DragAndDrop-specific painter logic.

const stage = (
  overrides: Partial<DragAndDrop.Props> = {},
  options: DragAndDropFixture.FixtureOptions = {},
) => {
  const fixture = DragAndDropFixture.start(overrides, options)
  const onPress = (button: ButtonNode): void => {
    const tag = button.action ?? button.token
    if (tag !== undefined) {
      fixture.press(tag)
    }
  }
  const painted = (): ReactElement => paintTree(fixture.tree(), { onPress })
  const buttonNamed = (label: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'Pressable'),
      element => propsOf(element)['accessibilityLabel'] === label,
    )
  const viewWithId = (nativeID: string): ReactElement =>
    firstOf(
      hostsOf(painted(), 'View'),
      element => propsOf(element)['nativeID'] === nativeID,
    )

  return { fixture, buttonNamed, viewWithId }
}

describe('core DragAndDrop Part on the React Native generic host', () => {
  it('paints Draggable button state, Droppable container selection, and assertive LiveRegion announcements across lift, move, drop, and cancel', () => {
    const staged = stage()

    const task1 = staged.buttonNamed('Write tests')
    const todo = staged.viewWithId('fixture-dnd-container-todo')
    const done = staged.viewWithId('fixture-dnd-container-done')
    const live = staged.viewWithId('fixture-dnd-live')

    expect(propsOf(task1)['accessibilityRole']).toBe('button')
    expect(propsOf(task1)['accessibilityState']).toMatchObject({
      disabled: false,
      selected: false,
    })
    expect(propsOf(todo)['accessibilityState']).toMatchObject({
      selected: false,
    })
    expect(propsOf(done)['accessibilityState']).toMatchObject({
      selected: false,
    })
    expect(propsOf(live)['accessibilityLiveRegion']).toBe('assertive')
    expect(wordsOf(live)).toBe('')

    // Pressing Write tests lifts it via generic Catalog action
    callProp(task1, 'onPress')
    expect(
      DragAndDrop.isKeyboardDragging(staged.fixture.dragAndDropState()),
    ).toBe(true)
    expect(
      propsOf(staged.buttonNamed('Write tests'))['accessibilityState'],
    ).toMatchObject({ selected: true })
    expect(
      propsOf(staged.viewWithId('fixture-dnd-container-todo'))[
        'accessibilityState'
      ],
    ).toMatchObject({ selected: true })
    expect(wordsOf(staged.viewWithId('fixture-dnd-live'))).toContain(
      'Lifted Write tests at position 1 of 2 in To Do.',
    )

    // Moving across containers updates container accessibilityState and live announcement
    staged.fixture.press('MoveDraggedItem:NextContainer')
    expect(
      propsOf(staged.viewWithId('fixture-dnd-container-todo'))[
        'accessibilityState'
      ],
    ).toMatchObject({ selected: false })
    expect(
      propsOf(staged.viewWithId('fixture-dnd-container-done'))[
        'accessibilityState'
      ],
    ).toMatchObject({ selected: true })
    expect(wordsOf(staged.viewWithId('fixture-dnd-live'))).toBe(
      'Moved Write tests to position 1 of 2 in Done.',
    )

    // Pressing Drop commits reorder and announces drop
    callProp(staged.buttonNamed('Drop'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('Write tests'))['accessibilityState'],
    ).toMatchObject({ selected: false })
    expect(wordsOf(staged.viewWithId('fixture-dnd-live'))).toBe(
      'Dropped Write tests at position 1 of 2 in Done.',
    )

    // Pointer drag + cancel announces cancellation
    staged.fixture.send(
      DragAndDrop.BeginPointerDrag({
        itemId: 'task-2',
        pointerId: 1,
        x: 0,
        y: 0,
      }),
    )
    staged.fixture.send(
      DragAndDrop.MovePointerDrag({
        pointerId: 1,
        x: 12,
        y: 0,
        maybeDropTarget: Option.some({ containerId: 'done', index: 0 }),
      }),
    )
    expect(
      propsOf(staged.buttonNamed('Build core'))['accessibilityState'],
    ).toMatchObject({ selected: true })

    callProp(staged.buttonNamed('Cancel'), 'onPress')
    expect(
      propsOf(staged.buttonNamed('Build core'))['accessibilityState'],
    ).toMatchObject({ selected: false })
    expect(wordsOf(staged.viewWithId('fixture-dnd-live'))).toBe(
      'Cancelled dragging Build core. Returned to position 2 of 2 in To Do.',
    )
  })

  it('paints disabled state and blocks drag activation when disabled', () => {
    const disabled = stage({
      items: [
        { id: 'task-1', label: 'Write tests', isDisabled: true },
        { id: 'task-2', label: 'Build core' },
        { id: 'task-3', label: 'Ship release' },
      ],
    })
    expect(
      propsOf(disabled.buttonNamed('Write tests'))['accessibilityState'],
    ).toMatchObject({ disabled: true, selected: false })

    disabled.fixture.send(DragAndDrop.LiftItem({ itemId: 'task-1' }))
    expect(DragAndDrop.isIdle(disabled.fixture.dragAndDropState())).toBe(true)
    expect(
      propsOf(disabled.buttonNamed('Write tests'))['accessibilityState'],
    ).toMatchObject({ selected: false })
  })
})
