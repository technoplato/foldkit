import { Array, Option, Schema as S } from 'effect'

import * as Disclosure from '../behavior/disclosure.js'
import * as Part from '../behavior/part.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Disclosure / Accordion Part
// once, driven by the HTML, React, and React Native generic host tests.
// Every painter draws this same screen tree through its own generic host
// with zero Disclosure-specific painter code.

export const FixtureModel = S.Struct({
  heading: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const RenameHeading = Catalog.action('RenameHeading', {
  fields: { heading: S.String },
  what: 'Updates the page heading',
  why: 'To title the collapsible view',
  meta: { label: 'Rename', keys: [] },
})

const fixtureCatalog = Catalog.make([RenameHeading])

const BaseProgram = make({
  id: 'disclosure-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ heading: 'Help' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, heading: message.heading }, []],
  catalog: fixtureCatalog,
})

export const singleDefaultProps: Disclosure.Props = {
  id: 'fixture-disclosure',
  label: 'Shipping details',
}

export const accordionItems: ReadonlyArray<Disclosure.Item> = [
  { value: 'overview', label: 'Overview' },
  { value: 'shipping', label: 'Shipping' },
  { value: 'billing', label: 'Billing', isDisabled: true },
  { value: 'returns', label: 'Returns' },
]

export const panelContent: Readonly<Record<string, string>> = {
  overview: 'Standard plan overview',
  shipping: 'Ships within two business days',
  billing: 'Invoices and payment methods',
  returns: 'Thirty-day return window',
}

export const accordionDefaultProps: Disclosure.Props = {
  id: 'fixture-accordion',
  label: 'Frequently asked questions',
  items: accordionItems,
  defaultOpenValues: ['overview'],
}

const noView: Part.View<Disclosure.State> = {
  state: Disclosure.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const singleScreen = (
  _model: FixtureModel,
  disclosure: Part.View<Disclosure.State>,
  props: Disclosure.Props = singleDefaultProps,
): UiNode =>
  Column(
    { gap: 1 },
    Button({
      label: props.label ?? 'Details',
      action: Disclosure.ToggleDisclosure.tag,
      disabled: Disclosure.isDisabledOf(props),
      slot: disclosure.slot('Button'),
    }),
    Box(
      { padding: 1, slot: disclosure.slot('Panel') },
      Text('Express shipping is available on all orders.'),
    ),
  )

export const accordionScreen = (
  _model: FixtureModel,
  disclosure: Part.View<Disclosure.State>,
  props: Disclosure.Props = accordionDefaultProps,
): UiNode => {
  const items = props.items ?? []
  const sections = Array.map(items, item =>
    Column(
      { gap: 0 },
      Button({
        label: item.label,
        action: Part.pressOf(
          Disclosure.ToggleDisclosureItem.tag,
          Option.some(item.value),
        ),
        disabled: Disclosure.isDisabledOf(props) || item.isDisabled === true,
        slot: disclosure.slot('Trigger', item.value),
      }),
      Box(
        { padding: 1, slot: disclosure.slot('Panel', item.value) },
        Text(panelContent[item.value] ?? item.label),
      ),
    ),
  )

  return Disclosure.orientationOf(props) === 'Horizontal'
    ? Row({ gap: 1, slot: disclosure.slot('Root') }, ...sections)
    : Column({ gap: 1, slot: disclosure.slot('Root') }, ...sections)
}

export const makeSingleApp = (overrides: Partial<Disclosure.Props> = {}) => {
  const resolvedProps: Disclosure.Props = {
    ...singleDefaultProps,
    ...overrides,
  }
  const part = Disclosure.make({ name: 'Disclosure' })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        singleScreen(model, views['Disclosure'] ?? noView, resolvedProps),
    }),
  }
}

export const makeAccordionApp = (overrides: Partial<Disclosure.Props> = {}) => {
  const resolvedProps: Disclosure.Props = {
    ...accordionDefaultProps,
    ...overrides,
  }
  const part = Disclosure.make({ name: 'Disclosure' })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        accordionScreen(model, views['Disclosure'] ?? noView, resolvedProps),
    }),
  }
}

export const { App: SingleApp, props: singleProps } = makeSingleApp()

export const { App: AccordionApp, props: accordionProps } = makeAccordionApp()

export type Model = typeof SingleApp.Model.Type

export type Running = Readonly<{
  props: Disclosure.Props
  model: () => Model
  disclosureState: () => Disclosure.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Disclosure.Message) => void
}>

const runApp = (
  composed: typeof SingleApp,
  resolvedProps: Disclosure.Props,
): Running => {
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
    disclosureState: () => held.model.parts['Disclosure'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}

export const startSingle = (
  overrides: Partial<Disclosure.Props> = {},
): Running => {
  const { App, props } = makeSingleApp(overrides)
  return runApp(App, props)
}

export const startAccordion = (
  overrides: Partial<Disclosure.Props> = {},
): Running => {
  const { App, props } = makeAccordionApp(overrides)
  return runApp(App, props)
}
