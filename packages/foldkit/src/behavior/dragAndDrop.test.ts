import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make } from '../program/program.js'
import * as Block from './block.js'
import * as DragAndDrop from './dragAndDrop.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as PointerDrag from './pointerDrag.js'
import * as Slot from './slot.js'

const baseProps: DragAndDrop.Props = {
  id: 'board',
  orientation: 'Vertical',
  containers: [
    { id: 'todo', label: 'To Do', itemIds: ['task-1', 'task-2', 'task-3'] },
    { id: 'done', label: 'Done', itemIds: ['task-4'] },
  ],
  items: [
    { id: 'task-1', label: 'Write tests' },
    { id: 'task-2', label: 'Build core' },
    { id: 'task-3', label: 'Review PR' },
    { id: 'task-4', label: 'Ship release' },
  ],
}

const step = (
  state: DragAndDrop.State,
  message: DragAndDrop.Message,
  props: DragAndDrop.Props = baseProps,
): DragAndDrop.State => DragAndDrop.chart.transition(state, message, props)[0]

describe('DragAndDrop Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(
      Block.problemsOf({ name: 'DragAndDrop', chart: DragAndDrop.chart }),
    ).toEqual([])
    expect(Part.problemsOf(DragAndDrop.part)).toEqual([])
    expect(Part.problemsOf(DragAndDrop.make({ sampleMs: 100 }))).toEqual([])
    expect(Part.problemsOf(DragAndDrop.deviceOnly())).toEqual([])

    DragAndDrop.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('derives element IDs, rect geometry, distance, intersection, and auto-scroll helpers', () => {
    expect(DragAndDrop.draggableId('board')).toBe('board-draggable')
    expect(DragAndDrop.draggableId('board', 'task-1')).toBe('board-item-task-1')
    expect(DragAndDrop.droppableId('board')).toBe('board-droppable')
    expect(DragAndDrop.droppableId('board', 'todo')).toBe(
      'board-container-todo',
    )
    expect(DragAndDrop.liveRegionId('board')).toBe('board-live')

    const boxA: PointerDrag.Rect = { x: 0, y: 0, width: 100, height: 40 }
    const boxB: PointerDrag.Rect = { x: 50, y: 20, width: 100, height: 40 }
    const boxFar: PointerDrag.Rect = { x: 200, y: 0, width: 100, height: 40 }

    expect(DragAndDrop.rectCenter(boxA)).toEqual({ x: 50, y: 20 })
    expect(DragAndDrop.rectContainsPoint(boxA, { x: 50, y: 20 })).toBe(true)
    expect(DragAndDrop.rectContainsPoint(boxA, { x: 101, y: 20 })).toBe(false)
    expect(DragAndDrop.pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(DragAndDrop.rectDistanceToPoint(boxA, { x: 50, y: 20 })).toBe(0)
    expect(DragAndDrop.rectDistanceToPoint(boxA, { x: 103, y: 44 })).toBe(5)
    expect(DragAndDrop.rectCenterDistance(boxA, boxFar)).toBe(200)
    expect(DragAndDrop.rectIntersectionArea(boxA, boxB)).toBe(1000)
    expect(DragAndDrop.rectsIntersect(boxA, boxB)).toBe(true)
    expect(DragAndDrop.rectsIntersect(boxA, boxFar)).toBe(false)
    expect(DragAndDrop.rectIntersectionRatio(boxA, boxA)).toBe(1)
    expect(DragAndDrop.rectIntersectionRatio(boxA, boxFar)).toBe(0)
    expect(DragAndDrop.rectIntersectionRatio(boxA, boxB)).toBeCloseTo(
      1000 / 7000,
    )

    expect(
      DragAndDrop.hasCrossedActivationThreshold(
        { x: 100, y: 200 },
        { x: 102, y: 201 },
      ),
    ).toBe(false)
    expect(
      DragAndDrop.hasCrossedActivationThreshold(
        { x: 100, y: 200 },
        { x: 103, y: 204 },
      ),
    ).toBe(true)

    expect(DragAndDrop.computeAutoScrollDelta(20, 800)).toBe(-7.5)
    expect(DragAndDrop.computeAutoScrollDelta(400, 800)).toBe(0)
    expect(DragAndDrop.computeAutoScrollDelta(780, 800)).toBe(7.5)
  })

  it('resolves closest target, most intersecting target, insertion index, and reorders for Vertical and Horizontal', () => {
    const targets: ReadonlyArray<DragAndDrop.TargetBounds> = [
      { id: 'todo', rect: { x: 0, y: 0, width: 100, height: 200 } },
      {
        id: 'locked',
        rect: { x: 110, y: 0, width: 100, height: 200 },
        isDisabled: true,
      },
      { id: 'done', rect: { x: 220, y: 0, width: 100, height: 200 } },
    ]

    expect(
      Option.map(
        DragAndDrop.findClosestTarget({ x: 40, y: 50 }, targets),
        target => target.id,
      ),
    ).toEqual(Option.some('todo'))
    expect(
      Option.map(
        DragAndDrop.findClosestTarget({ x: 150, y: 50 }, targets),
        target => target.id,
      ),
    ).toEqual(Option.some('todo'))
    expect(
      Option.map(
        DragAndDrop.findClosestTarget({ x: 250, y: 50 }, targets),
        target => target.id,
      ),
    ).toEqual(Option.some('done'))
    expect(
      DragAndDrop.findClosestTarget({ x: 500, y: 50 }, targets, {
        maxDistancePx: 50,
      }),
    ).toEqual(Option.none())

    expect(
      Option.map(
        DragAndDrop.findMostIntersectingTarget(
          { x: 80, y: 10, width: 200, height: 50 },
          targets,
        ),
        target => target.id,
      ),
    ).toEqual(Option.some('done'))

    const verticalItems: ReadonlyArray<PointerDrag.Rect> = [
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 0, y: 40, width: 100, height: 40 },
      { x: 0, y: 80, width: 100, height: 40 },
    ]
    expect(
      DragAndDrop.computeInsertionIndex(
        { x: 50, y: 10 },
        verticalItems,
        'Vertical',
      ),
    ).toBe(0)
    expect(
      DragAndDrop.computeInsertionIndex(
        { x: 50, y: 50 },
        verticalItems,
        'Vertical',
      ),
    ).toBe(1)
    expect(
      DragAndDrop.computeInsertionIndex(
        { x: 50, y: 95 },
        verticalItems,
        'Vertical',
      ),
    ).toBe(2)
    expect(
      DragAndDrop.computeInsertionIndex(
        { x: 50, y: 115 },
        verticalItems,
        'Vertical',
      ),
    ).toBe(3)

    const horizontalItems: ReadonlyArray<PointerDrag.Rect> = [
      { x: 0, y: 0, width: 60, height: 40 },
      { x: 60, y: 0, width: 60, height: 40 },
    ]
    expect(
      DragAndDrop.computeInsertionIndex(
        { x: 20, y: 20 },
        horizontalItems,
        'Horizontal',
      ),
    ).toBe(0)
    expect(
      DragAndDrop.computeInsertionIndex(
        { x: 80, y: 20 },
        horizontalItems,
        'Horizontal',
      ),
    ).toBe(1)
    expect(
      DragAndDrop.computeInsertionIndex(
        { x: 115, y: 20 },
        horizontalItems,
        'Horizontal',
      ),
    ).toBe(2)

    expect(
      DragAndDrop.resolveDropTargetFromBounds(
        { x: 50, y: 55 },
        [
          {
            id: 'todo',
            rect: { x: 0, y: 0, width: 100, height: 120 },
            itemRects: verticalItems,
          },
        ],
        { orientation: 'Vertical' },
      ),
    ).toEqual(Option.some({ containerId: 'todo', index: 1 }))

    expect(
      DragAndDrop.computeReorder(
        { itemId: 'task-1', containerId: 'todo', index: 0 },
        { containerId: 'todo', index: 2 },
      ),
    ).toEqual({
      itemId: 'task-1',
      fromContainerId: 'todo',
      fromIndex: 0,
      toContainerId: 'todo',
      toIndex: 2,
    })
    expect(
      DragAndDrop.computeReorder(
        { itemId: 'task-1', containerId: 'todo', index: 0 },
        { containerId: 'todo', index: 2 },
        { adjustForSameContainer: true },
      ),
    ).toEqual({
      itemId: 'task-1',
      fromContainerId: 'todo',
      fromIndex: 0,
      toContainerId: 'todo',
      toIndex: 1,
    })

    expect(DragAndDrop.moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(DragAndDrop.moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    const unchanged = ['a', 'b']
    expect(DragAndDrop.moveItem(unchanged, 1, 1)).toBe(unchanged)

    const reorderedSame = DragAndDrop.moveItemAcrossContainers(
      baseProps.containers,
      {
        fromContainerId: 'todo',
        fromIndex: 0,
        toContainerId: 'todo',
        toIndex: 2,
      },
    )
    expect(reorderedSame.map(container => container.itemIds)).toEqual([
      ['task-2', 'task-3', 'task-1'],
      ['task-4'],
    ])

    const reorderedAcross = DragAndDrop.moveItemAcrossContainers(
      baseProps.containers,
      {
        fromContainerId: 'todo',
        fromIndex: 1,
        toContainerId: 'done',
        toIndex: 0,
      },
    )
    expect(reorderedAcross.map(container => container.itemIds)).toEqual([
      ['task-1', 'task-3'],
      ['task-2', 'task-4'],
    ])
  })

  it('handles pointer drag lifecycle: Pending threshold, pointerId tracking, Dragging, drop, click release, and Escape cancel', () => {
    const started = step(
      DragAndDrop.initial,
      DragAndDrop.BeginPointerDrag({
        itemId: 'task-1',
        pointerId: 7,
        x: 100,
        y: 200,
      }),
    )
    expect(DragAndDrop.isPending(started)).toBe(true)
    expect(DragAndDrop.isDragging(started)).toBe(false)
    expect(DragAndDrop.pointerIdOf(started)).toEqual(Option.some(7))
    expect(DragAndDrop.maybeDraggedItemId(started)).toEqual(
      Option.some('task-1'),
    )
    expect(DragAndDrop.maybeOrigin(started)).toEqual(
      Option.some({ itemId: 'task-1', containerId: 'todo', index: 0 }),
    )
    expect(DragAndDrop.announcementOf(started, baseProps)).toBe('')

    // Movement below 5 px stays Pending
    const stillPending = step(
      started,
      DragAndDrop.MovePointerDrag({
        pointerId: 7,
        x: 102,
        y: 201,
        maybeDropTarget: Option.none(),
      }),
    )
    expect(DragAndDrop.isPending(stillPending)).toBe(true)
    expect(DragAndDrop.deltaOf(stillPending)).toEqual({ dx: 2, dy: 1 })

    // Releasing while Pending is a click (Idle with no outcome)
    const clicked = step(
      stillPending,
      DragAndDrop.ReleasePointerDrag({ pointerId: 7 }),
    )
    expect(DragAndDrop.isIdle(clicked)).toBe(true)
    expect(DragAndDrop.maybeLastOutcome(clicked)).toEqual(Option.none())
    expect(DragAndDrop.announcementOf(clicked, baseProps)).toBe('')

    // Movement crossing 5 px transitions Pending -> Dragging
    const active = step(
      stillPending,
      DragAndDrop.MovePointerDrag({
        pointerId: 7,
        x: 110,
        y: 200,
        maybeDropTarget: Option.none(),
      }),
    )
    expect(DragAndDrop.isPointerDragging(active)).toBe(true)
    expect(DragAndDrop.isDragging(active)).toBe(true)
    expect(DragAndDrop.isItemDragging(active, 'task-1')).toBe(true)
    expect(PointerDrag.isActivated(DragAndDrop.dragOf(active))).toBe(true)
    expect(DragAndDrop.announcementOf(active, baseProps)).toBe(
      'Lifted Write tests from position 1 of 3 in To Do.',
    )

    // Non-matching pointerId is ignored
    const wrongPointer = step(
      active,
      DragAndDrop.MovePointerDrag({
        pointerId: 99,
        x: 250,
        y: 200,
        maybeDropTarget: Option.some({ containerId: 'done', index: 1 }),
      }),
    )
    expect(DragAndDrop.maybeDropTarget(wrongPointer)).toEqual(Option.none())

    // Matching pointerId updates drop target & announcement
    const overDone = step(
      active,
      DragAndDrop.MovePointerDrag({
        pointerId: 7,
        x: 250,
        y: 200,
        maybeDropTarget: Option.some({ containerId: 'done', index: 1 }),
      }),
    )
    expect(DragAndDrop.maybeDropTarget(overDone)).toEqual(
      Option.some({ containerId: 'done', index: 1 }),
    )
    expect(DragAndDrop.isDropTargetContainer(overDone, 'done')).toBe(true)
    expect(DragAndDrop.isDropTargetContainer(overDone, 'todo')).toBe(false)
    expect(DragAndDrop.announcementOf(overDone, baseProps)).toBe(
      'Moved Write tests to position 2 of 2 in Done.',
    )

    // Release over valid target commits Dropped outcome
    const dropped = step(
      overDone,
      DragAndDrop.ReleasePointerDrag({ pointerId: 7 }),
    )
    expect(DragAndDrop.isIdle(dropped)).toBe(true)
    expect(DragAndDrop.lastReorderOf(dropped)).toEqual(
      Option.some({
        itemId: 'task-1',
        fromContainerId: 'todo',
        fromIndex: 0,
        toContainerId: 'done',
        toIndex: 1,
      }),
    )
    expect(DragAndDrop.announcementOf(dropped, baseProps)).toBe(
      'Dropped Write tests at position 2 of 2 in Done.',
    )

    // Release without target emits Cancelled outcome
    const droppedOutside = step(
      active,
      DragAndDrop.ReleasePointerDrag({ pointerId: 7 }),
    )
    expect(DragAndDrop.isIdle(droppedOutside)).toBe(true)
    expect(DragAndDrop.lastReorderOf(droppedOutside)).toEqual(Option.none())
    expect(DragAndDrop.announcementOf(droppedOutside, baseProps)).toBe(
      'Cancelled dragging Write tests. Returned to position 1 of 3 in To Do.',
    )

    // Escape cancels active pointer drag
    const escaped = step(
      overDone,
      DragAndDrop.PressedDragKey({ key: 'Escape' }),
    )
    expect(DragAndDrop.isIdle(escaped)).toBe(true)
    expect(DragAndDrop.announcementOf(escaped, baseProps)).toBe(
      'Cancelled dragging Write tests. Returned to position 1 of 3 in To Do.',
    )

    // Zero activation distance jumps directly from Idle to Dragging
    const instant = step(
      DragAndDrop.initial,
      DragAndDrop.BeginPointerDrag({
        itemId: 'task-1',
        pointerId: 3,
        x: 10,
        y: 10,
      }),
      { ...baseProps, activationDistancePx: 0 },
    )
    expect(DragAndDrop.isPointerDragging(instant)).toBe(true)
  })

  it('handles full keyboard drag-and-drop: Space/Enter lift, within and across containers in Vertical & Horizontal, drop, Escape cancel, and disabled guards', () => {
    // Space lifts from Idle
    const lifted = step(
      DragAndDrop.initial,
      DragAndDrop.PressedDragKey({ key: ' ', itemId: 'task-1' }),
    )
    expect(DragAndDrop.isKeyboardDragging(lifted)).toBe(true)
    expect(DragAndDrop.isDragging(lifted)).toBe(true)
    expect(DragAndDrop.maybeDropTarget(lifted)).toEqual(
      Option.some({ containerId: 'todo', index: 0 }),
    )
    expect(DragAndDrop.announcementOf(lifted, baseProps)).toContain(
      'Lifted Write tests at position 1 of 3 in To Do.',
    )

    // ArrowDown moves within container in Vertical orientation
    const movedDown = step(
      lifted,
      DragAndDrop.PressedDragKey({ key: 'ArrowDown' }),
    )
    expect(DragAndDrop.maybeDropTarget(movedDown)).toEqual(
      Option.some({ containerId: 'todo', index: 1 }),
    )
    expect(DragAndDrop.announcementOf(movedDown, baseProps)).toBe(
      'Moved Write tests to position 2 of 3 in To Do.',
    )

    // ArrowRight moves across containers in Vertical orientation (clamping to destination count)
    const movedRight = step(
      movedDown,
      DragAndDrop.PressedDragKey({ key: 'ArrowRight' }),
    )
    expect(DragAndDrop.maybeDropTarget(movedRight)).toEqual(
      Option.some({ containerId: 'done', index: 1 }),
    )
    expect(DragAndDrop.announcementOf(movedRight, baseProps)).toBe(
      'Moved Write tests to position 2 of 2 in Done.',
    )

    // Shift+Tab moves back to previous container
    const movedPrev = step(
      movedRight,
      DragAndDrop.PressedDragKey({ key: 'Tab', isShift: true }),
    )
    expect(DragAndDrop.maybeDropTarget(movedPrev)).toEqual(
      Option.some({ containerId: 'todo', index: 1 }),
    )

    // Enter commits the drop
    const committed = step(
      movedRight,
      DragAndDrop.PressedDragKey({ key: 'Enter' }),
    )
    expect(DragAndDrop.isIdle(committed)).toBe(true)
    expect(DragAndDrop.lastReorderOf(committed)).toEqual(
      Option.some({
        itemId: 'task-1',
        fromContainerId: 'todo',
        fromIndex: 0,
        toContainerId: 'done',
        toIndex: 1,
      }),
    )
    expect(DragAndDrop.announcementOf(committed, baseProps)).toBe(
      'Dropped Write tests at position 2 of 2 in Done.',
    )

    // Escape cancels keyboard drag restoring origin
    const cancelled = step(
      movedRight,
      DragAndDrop.PressedDragKey({ key: 'Escape' }),
    )
    expect(DragAndDrop.isIdle(cancelled)).toBe(true)
    expect(DragAndDrop.lastReorderOf(cancelled)).toEqual(Option.none())
    expect(DragAndDrop.announcementOf(cancelled, baseProps)).toBe(
      'Cancelled dragging Write tests. Returned to position 1 of 3 in To Do.',
    )

    // Horizontal orientation swaps within/across arrow axes
    const horizontalProps: DragAndDrop.Props = {
      ...baseProps,
      orientation: 'Horizontal',
    }
    const hLifted = step(
      DragAndDrop.initial,
      DragAndDrop.LiftItem({ itemId: 'task-1' }),
      horizontalProps,
    )
    const hRight = step(
      hLifted,
      DragAndDrop.PressedDragKey({ key: 'ArrowRight' }),
      horizontalProps,
    )
    expect(DragAndDrop.maybeDropTarget(hRight)).toEqual(
      Option.some({ containerId: 'todo', index: 1 }),
    )
    const hDown = step(
      hRight,
      DragAndDrop.PressedDragKey({ key: 'ArrowDown' }),
      horizontalProps,
    )
    expect(DragAndDrop.maybeDropTarget(hDown)).toEqual(
      Option.some({ containerId: 'done', index: 1 }),
    )

    // Disabled items and disabled containers are blocked / skipped
    const propsWithDisabled: DragAndDrop.Props = {
      id: 'board',
      containers: [
        { id: 'todo', label: 'To Do', itemIds: ['task-1', 'locked-task'] },
        {
          id: 'blocked',
          label: 'Blocked',
          itemIds: ['task-x'],
          isDisabled: true,
        },
        { id: 'done', label: 'Done', itemIds: [] },
      ],
      items: [{ id: 'locked-task', label: 'Locked', isDisabled: true }],
    }
    expect(
      DragAndDrop.isIdle(
        step(
          DragAndDrop.initial,
          DragAndDrop.LiftItem({ itemId: 'locked-task' }),
          propsWithDisabled,
        ),
      ),
    ).toBe(true)
    const liftedEnabled = step(
      DragAndDrop.initial,
      DragAndDrop.LiftItem({ itemId: 'task-1' }),
      propsWithDisabled,
    )
    const skippedDisabledContainer = step(
      liftedEnabled,
      DragAndDrop.MoveDraggedItem({ direction: 'NextContainer' }),
      propsWithDisabled,
    )
    expect(DragAndDrop.maybeDropTarget(skippedDisabledContainer)).toEqual(
      Option.some({ containerId: 'done', index: 0 }),
    )
  })

  it('projects reference-stable SlotBindings for Draggable, Droppable, and LiveRegion, and supports atRest + Pace + Part.compose', () => {
    const viewIdle = Part.view(DragAndDrop.part, DragAndDrop.initial, baseProps)
    expect(Part.view(DragAndDrop.part, DragAndDrop.initial, baseProps)).toBe(
      viewIdle,
    )

    const task1Idle = viewIdle.slot('Draggable', 'task-1')
    const task2Idle = viewIdle.slot('Draggable', 'task-2')
    const todoIdle = viewIdle.slot('Droppable', 'todo')
    const doneIdle = viewIdle.slot('Droppable', 'done')
    const liveIdle = viewIdle.slot('LiveRegion')

    expect(Slot.ariaOf(task1Idle)).toMatchObject({
      role: 'button',
      id: 'board-item-task-1',
      'aria-pressed': 'false',
      'aria-describedby': 'board-live',
      'aria-label': 'Write tests',
      tabindex: '0',
    })
    expect(Slot.ariaOf(todoIdle)).toMatchObject({
      role: 'region',
      id: 'board-container-todo',
      'aria-current': 'false',
      'aria-orientation': 'vertical',
      'aria-label': 'To Do',
    })
    expect(Slot.ariaOf(liveIdle)).toMatchObject({
      role: 'status',
      id: 'board-live',
      'aria-live': 'assertive',
      'aria-atomic': 'true',
    })

    // Lifting task-1 changes task-1 and todo, while task-2, done, and liveRegion keep identical object references
    const lifted = step(
      DragAndDrop.initial,
      DragAndDrop.LiftItem({ itemId: 'task-1' }),
    )
    const viewLifted = Part.view(DragAndDrop.part, lifted, baseProps)
    expect(viewLifted.slot('Draggable', 'task-1').isPressed).toBe(true)
    expect(viewLifted.slot('Droppable', 'todo').isCurrent).toBe(true)
    expect(viewLifted.slot('Draggable', 'task-2')).toBe(task2Idle)
    expect(viewLifted.slot('Droppable', 'done')).toBe(doneIdle)
    expect(viewLifted.slot('LiveRegion')).toBe(liveIdle)

    // atRest returns cleanly to Idle with no residual outcome
    expect(DragAndDrop.atRest(lifted)).toEqual(DragAndDrop.initial)

    // Sync pace: MovePointerDrag uses Pace.Sampled; discrete actions use Pace.Synced
    expect(
      DragAndDrop.paceOf(
        DragAndDrop.MovePointerDrag({
          pointerId: 1,
          x: 10,
          y: 20,
          maybeDropTarget: Option.none(),
        }),
      ),
    ).toEqual(Pace.Sampled({ everyMs: 50 }))
    expect(
      DragAndDrop.paceOf(
        DragAndDrop.MovePointerDrag({
          pointerId: 1,
          x: 10,
          y: 20,
          maybeDropTarget: Option.none(),
        }),
        100,
      ),
    ).toEqual(Pace.Sampled({ everyMs: 100 }))
    expect(
      DragAndDrop.paceOf(DragAndDrop.LiftItem({ itemId: 'task-1' })),
    ).toEqual(Pace.Synced())
    expect(
      DragAndDrop.paceOf(DragAndDrop.MoveDraggedItem({ direction: 'Down' })),
    ).toEqual(Pace.Synced())
    expect(DragAndDrop.paceOf(DragAndDrop.DropItem())).toEqual(Pace.Synced())
    expect(DragAndDrop.paceOf(DragAndDrop.CancelDrag())).toEqual(Pace.Synced())

    // JSON round-trip of every state variant
    const encodedLifted = S.encodeSync(DragAndDrop.State)(lifted)
    expect(S.decodeUnknownSync(DragAndDrop.State)(encodedLifted)).toEqual(
      lifted,
    )

    // Part.compose: synced Domain default + deviceOnly local isolation
    const Base = make({
      id: 'dnd-compose-test',
      version: 1,
      Model: S.Struct({ title: S.String }),
      Message: S.Struct({ _tag: S.Literal('NoChange') }),
      init: () => [{ title: 'Board' }, []],
      update: model => [model, []],
    })
    const SyncedApp = Part.compose({
      of: Base,
      parts: [Part.given(DragAndDrop.make({ sampleMs: 75 }), () => baseProps)],
    })
    expect(
      SyncedApp.synchronization?.messageCategory(
        DragAndDrop.LiftItem({ itemId: 'task-1' }),
      ),
    ).toBe('Domain')
    expect(
      SyncedApp.synchronization?.paceOf?.(
        DragAndDrop.MovePointerDrag({
          pointerId: 1,
          x: 12,
          y: 12,
          maybeDropTarget: Option.none(),
        }),
      ),
    ).toEqual(Pace.Sampled({ everyMs: 75 }))

    const [startModel] = SyncedApp.init()
    const [liftedModel] = SyncedApp.update(
      startModel,
      DragAndDrop.LiftItem({ itemId: 'task-1' }),
    )
    const restedModel = SyncedApp.synchronization?.projectLocal?.(liftedModel)
    expect(restedModel?.parts['DragAndDrop']).toEqual(DragAndDrop.initial)

    const DeviceApp = Part.compose({
      of: Base,
      parts: [Part.given(DragAndDrop.deviceOnly(), () => baseProps)],
    })
    expect(
      DeviceApp.synchronization?.isLocalOnly?.(
        DragAndDrop.LiftItem({ itemId: 'task-1' }),
      ),
    ).toBe(true)
  })
})
