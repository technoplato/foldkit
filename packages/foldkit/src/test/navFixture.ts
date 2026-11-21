import { Array, Option, Schema as S } from 'effect'

import * as Nav from '../behavior/nav.js'
import * as Part from '../behavior/part.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Nav Part once, driven by the
// HTML, React, and React Native generic host tests. Every painter draws this
// same screen tree through its own generic host with zero Nav-specific
// painter code.

export const FixtureModel = S.Struct({
  currentValue: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const SelectSection = Catalog.action('SelectSection', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'section',
    prompt: 'Which section?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No section is available',
  },
  what: 'Navigates to the selected section',
  why: 'To update the active destination in the navigation bar',
  meta: { label: 'Select section', keys: [] },
})

const fixtureCatalog = Catalog.make([SelectSection])

const BaseProgram = make({
  id: 'nav-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ currentValue: 'dashboard' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, currentValue: message.value }, []],
  catalog: fixtureCatalog,
})

export const defaultProps: Nav.Props = {
  id: 'fixture-nav',
  label: 'Main navigation',
  orientation: 'Horizontal',
  currentValue: 'dashboard',
  items: [
    { value: 'dashboard', label: 'Dashboard', href: '/dashboard' },
    { value: 'products', label: 'Products', hasSubmenu: true },
    {
      value: 'disabled',
      label: 'Disabled',
      hasSubmenu: true,
      isDisabled: true,
    },
    { value: 'resources', label: 'Resources', hasSubmenu: true },
  ],
}

const noView: Part.View<Nav.State> = {
  state: Nav.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const navScreen = (
  _model: FixtureModel,
  navView: Part.View<Nav.State>,
  props: Nav.Props = defaultProps,
): UiNode => {
  const itemNodes = Array.map(props.items, item =>
    item.hasSubmenu === true
      ? Column(
          { gap: 0 },
          Button({
            label: item.label,
            action: Part.pressOf(
              Nav.ToggleNavItem.tag,
              Option.some(item.value),
            ),
            disabled: Nav.isItemDisabled(props, item.value),
            slot: navView.slot('Trigger', item.value),
          }),
          Box(
            { padding: 1, slot: navView.slot('Content', item.value) },
            Text(`${item.label} submenu`),
          ),
        )
      : Button({
          label: item.label,
          action: Part.pressOf(SelectSection.tag, Option.some(item.value)),
          disabled: Nav.isItemDisabled(props, item.value),
          slot: navView.slot('Link', item.value),
        }),
  )

  const container =
    Nav.orientationOf(props) === 'Vertical'
      ? Column({ gap: 1, slot: navView.slot('Nav') }, ...itemNodes)
      : Row({ gap: 1, slot: navView.slot('Nav') }, ...itemNodes)

  return Column(
    { gap: 1 },
    container,
    ...(Nav.isOpen(navView.state)
      ? [Button({ label: 'Close nav', action: Nav.CloseNav.tag })]
      : []),
  )
}

export const makeApp = (overrides: Partial<Nav.Props> = {}) => {
  const baseProps: Nav.Props = { ...defaultProps, ...overrides }
  const propsFor = (model: FixtureModel): Nav.Props => ({
    ...baseProps,
    currentValue:
      overrides.currentValue !== undefined && model.currentValue === 'dashboard'
        ? overrides.currentValue
        : model.currentValue,
  })
  const part = Nav.make({ name: 'Nav' })
  return {
    props: baseProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, propsFor)],
      screen: (model, views) =>
        navScreen(model, views['Nav'] ?? noView, propsFor(model)),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Nav.Props
  model: () => Model
  navState: () => Nav.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Nav.Message) => void
}>

export const start = (overrides: Partial<Nav.Props> = {}): Running => {
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
    navState: () => held.model.parts['Nav'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
