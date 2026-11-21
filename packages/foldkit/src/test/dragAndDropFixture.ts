import { Array, Option, Schema as S } from 'effect'

import * as DragAndDrop from '../behavior/dragAndDrop.js'
import * as Part from '../behavior/part.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core DragAndDrop Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero
// DragAndDrop-specific painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the board heading',
  why: 'To title the drag-and-drop board view',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'drag-and-drop-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Tasks' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const defaultProps: DragAndDrop.Props = {
  id: 'fixture-dnd',
  orientation: 'Vertical',
  containers: [
    { id: 'todo', label: 'To Do', itemIds: ['task-1', 'task-2'] },
    { id: 'done', label: 'Done', itemIds: ['task-3'] },
  ],
  items: [
    { id: 'task-1', label: 'Write tests' },
    { id: 'task-2', label: 'Build core' },
    { id: 'task-3', label: 'Ship release' },
  ],
}

const noView: Part.View<DragAndDrop.State> = {
  state: DragAndDrop.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const dragAndDropScreen = (
  model: FixtureModel,
  dragView: Part.View<DragAndDrop.State>,
  props: DragAndDrop.Props = defaultProps,
): UiNode => {
  const isActive = DragAndDrop.isActive(dragView.state)
  const containerNodes = Array.map(props.containers, container =>
    Column(
      { gap: 1, slot: dragView.slot('Droppable', container.id) },
      Text(container.label ?? container.id),
      ...Array.map(container.itemIds, itemId =>
        Button({
          label: DragAndDrop.itemLabelOf(itemId, props),
          action: Part.pressOf(DragAndDrop.LiftItem.tag, Option.some(itemId)),
          disabled: DragAndDrop.isItemDisabled(itemId, props),
          slot: dragView.slot('Draggable', itemId),
        }),
      ),
    ),
  )

  return Column(
    { gap: 1 },
    Text(model.heading),
    Row(
      { gap: 1 },
      Button({
        label: 'Drop',
        action: DragAndDrop.DropItem.tag,
        disabled: !isActive,
      }),
      Button({
        label: 'Cancel',
        action: DragAndDrop.CancelDrag.tag,
        disabled: !isActive,
      }),
    ),
    Row({ gap: 1 }, ...containerNodes),
    Box(
      { padding: 0, slot: dragView.slot('LiveRegion') },
      Text(DragAndDrop.announcementOf(dragView.state, props)),
    ),
  )
}

export type FixtureOptions = Readonly<{
  sampleMs?: number
}>

export const makeApp = (
  overrides: Partial<DragAndDrop.Props> = {},
  options: FixtureOptions = {},
) => {
  const resolvedProps: DragAndDrop.Props = { ...defaultProps, ...overrides }
  const part = DragAndDrop.make({
    name: 'DragAndDrop',
    ...(options.sampleMs === undefined ? {} : { sampleMs: options.sampleMs }),
  })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        dragAndDropScreen(model, views['DragAndDrop'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: DragAndDrop.Props
  model: () => Model
  dragAndDropState: () => DragAndDrop.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: DragAndDrop.Message) => void
}>

export const start = (
  overrides: Partial<DragAndDrop.Props> = {},
  options: FixtureOptions = {},
): Running => {
  const { App: composed, props: resolvedProps } = makeApp(overrides, options)
  const [initialModel] = composed.init()
  const held: { model: Model } = { model: initialModel }

  const sendMessage = (message: Readonly<{ _tag: string }>): void => {
    const [nextModel] = composed.update(held.model, message)
    held.model = nextModel
  }

  const press = (tag: string): void => {
    const messages = composed.interaction?.press(held.model, tag) ?? []
    Array.forEach(messages, sendMessage)
  }

  return {
    props: resolvedProps,
    model: () => held.model,
    dragAndDropState: () => held.model.parts['DragAndDrop'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
