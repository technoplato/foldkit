import { Array, Option, Schema as S } from 'effect'

import * as Part from '../behavior/part.js'
import * as VirtualList from '../behavior/virtualList.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core VirtualList Part once, driven
// by the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero
// VirtualList-specific painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the virtualized list heading',
  why: 'To title the list viewport',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'virtual-list-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Records' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const defaultProps: VirtualList.Props = {
  id: 'fixture-virtual-list',
  label: 'Records viewport',
  itemCount: 100,
  rowHeightPx: 30,
  overscan: 0,
}

const noView: Part.View<VirtualList.State> = {
  state: VirtualList.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const virtualListScreen = (
  model: FixtureModel,
  listView: Part.View<VirtualList.State>,
  props: VirtualList.Props = defaultProps,
): UiNode => {
  const maybeWindow = VirtualList.visibleWindowOf(listView.state, props)
  const visibleRows = Option.match(maybeWindow, {
    onNone: (): ReadonlyArray<UiNode> => [Text('Measuring viewport')],
    onSome: window => {
      const count = Math.max(0, window.endIndex - window.startIndex)
      return Array.makeBy(count, offset => {
        const index = window.startIndex + offset
        return Box(
          { padding: 0, slot: listView.slot('Item', String(index)) },
          Text(`Row ${index}`),
        )
      })
    },
  })

  return Column(
    { gap: 1, slot: listView.slot('Viewport') },
    Text(model.heading),
    Row(
      { gap: 1 },
      Button({ label: 'Scroll to top', action: VirtualList.ScrollToTop.tag }),
      Button({
        label: 'Scroll to bottom',
        action: VirtualList.ScrollToBottom.tag,
      }),
    ),
    Column({ gap: 0, slot: listView.slot('Content') }, ...visibleRows),
  )
}

export const makeApp = (overrides: Partial<VirtualList.Props> = {}) => {
  const resolvedProps: VirtualList.Props = { ...defaultProps, ...overrides }
  const part = VirtualList.make({ name: 'VirtualList' })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        virtualListScreen(model, views['VirtualList'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: VirtualList.Props
  model: () => Model
  virtualListState: () => VirtualList.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: VirtualList.Message) => void
}>

export const start = (overrides: Partial<VirtualList.Props> = {}): Running => {
  const { App: composed, props: resolvedProps } = makeApp(overrides)
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
    virtualListState: () => held.model.parts['VirtualList'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
