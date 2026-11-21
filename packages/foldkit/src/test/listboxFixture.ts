import { Array, Option, Schema as S } from 'effect'

import * as Listbox from '../behavior/listbox.js'
import * as Part from '../behavior/part.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Listbox Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero Listbox-
// specific painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the listbox heading',
  why: 'To title the listbox view',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'listbox-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Favorite fruit' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const items: ReadonlyArray<Listbox.Item> = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot' },
  { value: 'banana', label: 'Banana', isDisabled: true },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date' },
]

export const defaultProps: Listbox.Props = {
  id: 'fixture-listbox',
  hasLabel: true,
  name: 'fruit',
  items,
}

const noView: Part.View<Listbox.State> = {
  state: Listbox.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const listboxScreen = (
  model: FixtureModel,
  listbox: Part.View<Listbox.State>,
  props: Listbox.Props = defaultProps,
): UiNode => {
  const optionNodes = Array.map(props.items, item => {
    const isDisabled = props.isDisabled === true || item.isDisabled === true
    const action = Part.pressOf(
      Listbox.SelectListboxOption.tag,
      Option.some(item.value),
    )
    return Button({
      label: item.label,
      action,
      disabled: isDisabled,
      slot: listbox.slot('Option', item.value),
    })
  })

  const container =
    Listbox.orientationOf(props) === 'Horizontal'
      ? Row({ gap: 1, slot: listbox.slot('Listbox') }, ...optionNodes)
      : Column({ gap: 1, slot: listbox.slot('Listbox') }, ...optionNodes)

  return Column(
    { gap: 1 },
    Box(
      { padding: 0, slot: listbox.slot('Label') },
      Text(props.label ?? model.heading),
    ),
    container,
  )
}

export const makeApp = (overrides: Partial<Listbox.Props> = {}) => {
  const resolvedProps: Listbox.Props = { ...defaultProps, ...overrides }
  const part = Listbox.make({
    name: 'Listbox',
    ...(resolvedProps.defaultValue === undefined
      ? {}
      : { defaultValue: resolvedProps.defaultValue }),
  })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        listboxScreen(model, views['Listbox'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Listbox.Props
  model: () => Model
  listboxState: () => Listbox.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Listbox.Message) => void
}>

export const start = (overrides: Partial<Listbox.Props> = {}): Running => {
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
    listboxState: () => held.model.parts['Listbox'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
