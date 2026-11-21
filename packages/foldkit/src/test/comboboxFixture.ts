import { Array, Option, Schema as S } from 'effect'

import * as Combobox from '../behavior/combobox.js'
import * as Part from '../behavior/part.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import {
  Box,
  Button,
  Column,
  Row,
  Text,
  TextInput,
} from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Combobox Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero Combobox-
// specific painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the combobox heading',
  why: 'To title the combobox view',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'combobox-host-fixture',
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

export const items: ReadonlyArray<Combobox.Item> = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot' },
  { value: 'banana', label: 'Banana', isDisabled: true },
  { value: 'creme', label: 'Crème Brûlée' },
  { value: 'cherry', label: 'Cherry' },
]

export const defaultProps: Combobox.Props = {
  id: 'fixture-combobox',
  placeholder: 'Search fruit...',
  hasLabel: true,
  hasDescription: true,
  hasError: true,
  name: 'fruit',
  items,
}

const noView: Part.View<Combobox.State> = {
  state: Combobox.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const comboboxScreen = (
  model: FixtureModel,
  combobox: Part.View<Combobox.State>,
  props: Combobox.Props = defaultProps,
): UiNode => {
  const visibleItems = Combobox.filteredItemsOf(combobox.state, props)
  const optionNodes = Array.isReadonlyArrayEmpty(visibleItems)
    ? [Text('No matching fruits')]
    : Array.map(visibleItems, item =>
        Button({
          label: item.label,
          action: Part.pressOf(
            Combobox.SelectComboboxOption.tag,
            Option.some(item.value),
          ),
          disabled: Combobox.isOptionDisabled(props, item.value),
          slot: combobox.slot('Option', item.value),
        }),
      )

  return Column(
    { gap: 1 },
    Box(
      { padding: 0, slot: combobox.slot('Label') },
      Text(props.label ?? model.heading),
    ),
    Row(
      { gap: 1 },
      TextInput({
        value: Combobox.inputValueOf(combobox.state),
        placeholder: props.placeholder ?? 'Search...',
        token: `${Combobox.ChangeComboboxInput.tag}:`,
        slot: combobox.slot('Input'),
      }),
      Button({
        label: 'Toggle options',
        action: Combobox.ToggleCombobox.tag,
        disabled: Combobox.isDisabledOf(props),
        slot: combobox.slot('Trigger'),
      }),
      Button({
        label: 'Clear combobox',
        action: Combobox.ClearCombobox.tag,
        disabled: Combobox.isDisabledOf(props),
        slot: combobox.slot('ClearButton'),
      }),
    ),
    Column({ gap: 1, slot: combobox.slot('Content') }, ...optionNodes),
    ...(Combobox.isOpen(combobox.state)
      ? [
          Button({
            label: 'Dismiss combobox',
            action: Combobox.DismissCombobox.tag,
            slot: combobox.slot('Backdrop'),
          }),
        ]
      : []),
    Box(
      { padding: 0, slot: combobox.slot('Description') },
      Text('Type to filter or pick a fruit'),
    ),
    Box(
      { padding: 0, slot: combobox.slot('Error') },
      Text('Please choose a fruit'),
    ),
  )
}

export const makeApp = (overrides: Partial<Combobox.Props> = {}) => {
  const resolvedProps: Combobox.Props = { ...defaultProps, ...overrides }
  const part = Combobox.make({
    name: 'Combobox',
    ...(resolvedProps.defaultValue === undefined
      ? {}
      : { defaultValue: resolvedProps.defaultValue }),
    ...(resolvedProps.defaultInputValue === undefined
      ? {}
      : { defaultInputValue: resolvedProps.defaultInputValue }),
    ...(resolvedProps.settleMs === undefined
      ? {}
      : { settleMs: resolvedProps.settleMs }),
  })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        comboboxScreen(model, views['Combobox'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Combobox.Props
  model: () => Model
  comboboxState: () => Combobox.State
  tree: () => UiNode
  press: (tag: string) => void
  type: (token: string, value: string) => void
  send: (message: Combobox.Message) => void
}>

const changePrefix = `${Combobox.ChangeComboboxInput.tag}:`

export const start = (overrides: Partial<Combobox.Props> = {}): Running => {
  const { App: composed, props: resolvedProps } = makeApp(overrides)
  const [initialModel] = composed.init()
  const held: { model: Model } = { model: initialModel }

  const sendMessage = (message: Readonly<{ _tag: string }>): void => {
    const [nextModel] = composed.update(held.model, message)
    held.model = nextModel
  }

  const press = (tag: string): void => {
    if (tag === changePrefix) {
      sendMessage(Combobox.ChangeComboboxInput({ value: '' }))
      return
    }
    const messages = composed.interaction?.press(held.model, tag) ?? []
    Array.forEach(messages, sendMessage)
  }

  const type = (token: string, value: string): void => {
    press(`${token}${value}`)
  }

  return {
    props: resolvedProps,
    model: () => held.model,
    comboboxState: () => held.model.parts['Combobox'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    type,
    send: sendMessage,
  }
}
