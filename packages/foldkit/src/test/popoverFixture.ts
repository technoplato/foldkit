import { Array, Option, Schema as S } from 'effect'

import * as Part from '../behavior/part.js'
import * as Popover from '../behavior/popover.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Popover Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero Popover-specific
// painter code.

export const FixtureModel = S.Struct({
  appliedCount: S.Number,
})
export type FixtureModel = typeof FixtureModel.Type

const ApplyFilters = Catalog.action('ApplyFilters', {
  what: 'Applies the selected filters',
  why: 'To update the view with the popover choices',
  meta: { label: 'Apply', keys: [] },
})

const fixtureCatalog = Catalog.make([ApplyFilters])

const BaseProgram = make({
  id: 'popover-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ appliedCount: 0 }, []],
  update: (model: FixtureModel) => [
    { appliedCount: model.appliedCount + 1 },
    [],
  ],
  catalog: fixtureCatalog,
})

export const popoverProps: Popover.Props = {
  id: 'fixture-popover',
  label: 'Filter options',
  focusableIds: ['fixture-popover-close', 'fixture-popover-apply'],
}

export const modalPopoverProps: Popover.Props = {
  id: 'fixture-modal-popover',
  isModal: true,
  label: 'Modal options',
  focusableIds: ['fixture-modal-popover-close', 'fixture-modal-popover-apply'],
}

const noView: Part.View<Popover.State> = {
  state: Popover.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const popoverScreen = (
  _model: FixtureModel,
  popover: Part.View<Popover.State>,
  props: Popover.Props,
): UiNode =>
  Column(
    { gap: 1 },
    Button({
      label: 'Open popover',
      action: Popover.TogglePopover.tag,
      slot: popover.slot('Trigger'),
    }),
    ...(Popover.isOpen(popover.state)
      ? [
          Box(
            {
              padding: 1,
              ...Popover.boxLayerOf(popover, props),
            },
            Text(props.label ?? props.id),
            Button({
              label: 'Panel surface',
              slot: popover.slot('Panel'),
            }),
            Button({
              label: 'Close popover',
              action: Popover.ClosePopover.tag,
              slot: popover.slot('CloseButton'),
            }),
            Button({
              label: 'Dismiss backdrop',
              action: Popover.DismissPopover.tag,
              slot: popover.slot('Backdrop'),
            }),
          ),
        ]
      : []),
  )

const buildApp = (props: Popover.Props, partName: string) => {
  const part = Popover.make({ name: partName })
  return Part.compose({
    of: BaseProgram,
    parts: [Part.given(part, () => props)],
    screen: (model, views) =>
      popoverScreen(model, views[partName] ?? noView, props),
  })
}

export const App = buildApp(popoverProps, 'Popover')

export const ModalApp = buildApp(modalPopoverProps, 'ModalPopover')

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  model: () => Model
  popoverState: () => Popover.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Popover.Message) => void
}>

const startApp = (app: typeof App, partName: string): Running => {
  const [initialModel] = app.init()
  const held: { model: Model } = { model: initialModel }

  const sendMessage = (message: Readonly<{ _tag: string }>): void => {
    const [nextModel] = app.update(held.model, message)
    held.model = nextModel
  }

  const press = (tag: string): void => {
    const messages = app.interaction?.press(held.model, tag) ?? []
    Array.forEach(messages, sendMessage)
  }

  return {
    model: () => held.model,
    popoverState: () => held.model.parts[partName],
    tree: () => app.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}

export const start = (): Running => startApp(App, 'Popover')

export const startModal = (): Running => startApp(ModalApp, 'ModalPopover')
