import { Array, Option, Schema as S } from 'effect'

import * as Dialog from '../behavior/dialog.js'
import * as Part from '../behavior/part.js'
import * as Catalog from '../catalog/catalog.js'
import { make } from '../program/program.js'
import { Box, Button, Column, Text } from '../renderers/elements.js'
import type { UiNode } from '../renderers/types.js'

// NOTE: shared test Program composing the core Dialog Part once, driven by
// the HTML, React, and React Native generic host tests. Every painter draws
// this same screen tree through its own generic host with zero Dialog-specific
// painter code.

export const FixtureModel = S.Struct({
  confirmations: S.Number,
})
export type FixtureModel = typeof FixtureModel.Type

const ConfirmDelete = Catalog.action('ConfirmDelete', {
  what: 'Confirms the pending deletion',
  why: 'To complete the dialog action',
  meta: { label: 'Confirm', keys: [] },
})

const fixtureCatalog = Catalog.make([ConfirmDelete])

const BaseProgram = make({
  id: 'dialog-host-fixture',
  version: 1,
  Model: FixtureModel,
  Message: fixtureCatalog.Message,
  init: () => [{ confirmations: 0 }, []],
  update: (model: FixtureModel) => [
    { confirmations: model.confirmations + 1 },
    [],
  ],
  catalog: fixtureCatalog,
})

export const dialogProps: Dialog.Props = {
  id: 'fixture-dialog',
  label: 'Delete item',
  focusableIds: ['fixture-dialog-close', 'fixture-dialog-confirm'],
}

export const alertDialogProps: Dialog.Props = {
  id: 'fixture-alert',
  role: 'alertdialog',
  label: 'Confirm permanent deletion',
  focusableIds: ['fixture-alert-close', 'fixture-alert-confirm'],
}

const noView: Part.View<Dialog.State> = {
  state: Dialog.initial,
  slot: () => ({ gestures: [], maybeHold: Option.none() }),
}

export const dialogScreen = (
  _model: FixtureModel,
  dialog: Part.View<Dialog.State>,
  props: Dialog.Props,
): UiNode =>
  Column(
    { gap: 1 },
    Button({
      label: 'Open dialog',
      action: Dialog.ToggleDialog.tag,
      slot: dialog.slot('Trigger'),
    }),
    ...(Dialog.isOpen(dialog.state)
      ? [
          Box(
            {
              padding: 1,
              ...Dialog.boxLayerOf(dialog, props),
            },
            Text(props.label ?? props.id),
            Button({
              label: 'Panel surface',
              slot: dialog.slot('Panel'),
            }),
            Button({
              label: 'Close dialog',
              action: Dialog.CloseDialog.tag,
              slot: dialog.slot('CloseButton'),
            }),
            Button({
              label: 'Dismiss backdrop',
              action: Dialog.DismissDialog.tag,
              slot: dialog.slot('Backdrop'),
            }),
          ),
        ]
      : []),
  )

const buildApp = (props: Dialog.Props, partName: string) => {
  const part = Dialog.make({ name: partName })
  return Part.compose({
    of: BaseProgram,
    parts: [Part.given(part, () => props)],
    screen: (model, views) =>
      dialogScreen(model, views[partName] ?? noView, props),
  })
}

export const App = buildApp(dialogProps, 'Dialog')

export const AlertApp = buildApp(alertDialogProps, 'AlertDialog')

export type Model = typeof App.Model.Type

export type Running = Readonly<{
  model: () => Model
  dialogState: () => Dialog.State
  tree: () => UiNode
  press: (tag: string) => void
  send: (message: Dialog.Message) => void
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
    dialogState: () => held.model.parts[partName],
    tree: () => app.screen?.(held.model) ?? Column({ gap: 0 }),
    press,
    send: sendMessage,
  }
}

export const start = (): Running => startApp(App, 'Dialog')

export const startAlert = (): Running => startApp(AlertApp, 'AlertDialog')
