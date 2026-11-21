import { Array, Option, Schema as S } from 'effect'

import * as Part from '../behavior/part.js'
import * as Tabs from '../behavior/tabs.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Tabs Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero Tabs-specific
// painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the page heading',
  why: 'To title the tabbed view',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'tabs-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Account' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const items: ReadonlyArray<Tabs.Item> = [
  { value: 'overview', label: 'Overview' },
  { value: 'details', label: 'Details' },
  { value: 'billing', label: 'Billing', isDisabled: true },
  { value: 'security', label: 'Security' },
]

export const panelContent: Readonly<Record<string, string>> = {
  overview: 'Account overview summary',
  details: 'Profile details and preferences',
  billing: 'Billing invoices and cards',
  security: 'Two-factor keys and sessions',
}

export const defaultProps: Tabs.Props = {
  id: 'fixture-tabs',
  label: 'Account sections',
  items,
}

const noView: Part.View<Tabs.State> = {
  state: Tabs.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const tabsScreen = (
  _model: FixtureModel,
  tabs: Part.View<Tabs.State>,
  props: Tabs.Props = defaultProps,
): UiNode => {
  const tabButtons = Array.map(props.items, item =>
    Button({
      label: item.label,
      variant: 'Tab',
      action: Part.pressOf(Tabs.SelectTab.tag, Option.some(item.value)),
      disabled: item.isDisabled === true,
      slot: tabs.slot('Tab', item.value),
    }),
  )
  const listNode =
    Tabs.orientationOf(props) === 'Vertical'
      ? Column({ gap: 1, slot: tabs.slot('List') }, ...tabButtons)
      : Row({ gap: 1, slot: tabs.slot('List') }, ...tabButtons)

  const panels = Array.map(props.items, item =>
    Box(
      { padding: 1, slot: tabs.slot('Panel', item.value) },
      Text(panelContent[item.value] ?? item.label),
    ),
  )

  return Column({ gap: 1 }, listNode, ...panels)
}

export const makeApp = (overrides: Partial<Tabs.Props> = {}) => {
  const resolvedProps: Tabs.Props = { ...defaultProps, ...overrides }
  const part = Tabs.make({ name: 'Tabs' })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        tabsScreen(model, views['Tabs'] ?? noView, resolvedProps),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Tabs.Props
  model: () => Model
  tabsState: () => Tabs.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Tabs.Message) => void
}>

export const start = (overrides: Partial<Tabs.Props> = {}): Running => {
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
    tabsState: () => held.model.parts['Tabs'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
