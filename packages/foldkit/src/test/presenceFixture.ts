import { Array, Option, Schema as S } from 'effect'

import * as Part from '../behavior/part.js'
import * as Presence from '../behavior/presence.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Row, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Presence Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero
// Presence-specific painter code.

export const FixtureModel = S.Struct({
  bannerText: S.String,
})
export type FixtureModel = typeof FixtureModel.Type

const UpdateBanner = Catalog.action('UpdateBanner', {
  fields: { bannerText: S.String },
  what: 'Updates the banner message text',
  why: 'To display fresh copy inside the animated container',
  meta: { label: 'Update banner', keys: [] },
})

const fixtureCatalog = Catalog.make([UpdateBanner])

const BaseProgram = make({
  id: 'presence-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ bannerText: 'All changes saved' }, []],
  update: (
    model: FixtureModel,
    message: typeof fixtureCatalog.Message.Type,
  ) => [{ ...model, bannerText: message.bannerText }, []],
  catalog: fixtureCatalog,
})

export const defaultProps: Presence.Props = {
  id: 'fixture-presence',
  label: 'Status banner',
  isAnimated: true,
}

const noView: Part.View<Presence.State> = {
  state: Presence.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const presenceScreen = (
  model: FixtureModel,
  presenceView: Part.View<Presence.State>,
): UiNode =>
  Column(
    { gap: 1 },
    Row(
      { gap: 1 },
      Button({
        label: 'Show banner',
        action: Presence.Show.tag,
        slot: presenceView.slot('ShowTrigger'),
      }),
      Button({
        label: 'Hide banner',
        action: Presence.Hide.tag,
        slot: presenceView.slot('HideTrigger'),
      }),
    ),
    Box(
      { padding: 1, slot: presenceView.slot('Container') },
      Text(model.bannerText),
    ),
  )

export const makeApp = (overrides: Partial<Presence.Props> = {}) => {
  const resolvedProps: Presence.Props = { ...defaultProps, ...overrides }
  const part = Presence.make({ name: 'Presence' })
  return {
    props: resolvedProps,
    App: Part.compose({
      of: BaseProgram,
      parts: [Part.given(part, () => resolvedProps)],
      screen: (model, views) =>
        presenceScreen(model, views['Presence'] ?? noView),
    }),
  }
}

export const { App, props } = makeApp()

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  props: Presence.Props
  model: () => Model
  presenceState: () => Presence.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Presence.Message) => void
}>

export const start = (overrides: Partial<Presence.Props> = {}): Running => {
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
    presenceState: () => held.model.parts['Presence'],
    tree: () => composed.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}
