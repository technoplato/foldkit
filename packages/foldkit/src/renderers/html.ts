import { Array, Match as M } from 'effect'

import { type Html, html } from '../html/index.js'
import type { Device } from './device.js'
import { type MobilePad, type PadAction, padOf } from './pad.js'
import type { UiNode } from './types.js'

/** Paints a Program screen tree as Foldkit HTML. A Button token becomes a click. */
export const paintHtml = <Message>(
  node: UiNode,
  toMessage: (token: string) => Message | undefined,
): Html => {
  const h = html<Message>()
  const paint = (current: UiNode): Html =>
    M.value(current).pipe(
      M.withReturnType<Html>(),
      M.tagsExhaustive({
        Text: text => {
          if (text.href === undefined) {
            return h.div([h.Class('fk-text')], [text.content])
          }
          return h.div(
            [h.Class('fk-text')],
            [h.a([h.Href(text.href), h.Class('fk-text-link')], [text.content])],
          )
        },
        Button: button => {
          const message =
            button.token === undefined ? undefined : toMessage(button.token)
          const click =
            message !== undefined && button.disabled !== true
              ? [h.OnClick(message)]
              : []
          const disabled = button.disabled === true ? [h.Disabled(true)] : []
          return h.button(
            [h.Type('button'), h.Class('fk-button'), ...click, ...disabled],
            [button.label],
          )
        },
        TextInput: input => {
          const token = input.token
          const messageFromToken = (nextToken: string): Message => {
            const message = toMessage(nextToken)
            if (message !== undefined) {
              return message
            }
            throw new Error(`unknown screen token: ${nextToken}`)
          }
          const attrs = [
            h.Type('text'),
            h.Class('fk-text-input'),
            h.Value(input.value),
            ...(input.placeholder === undefined
              ? []
              : [h.Placeholder(input.placeholder)]),
            ...(input.focused === true ? [h.Autofocus(true)] : []),
            ...(token === undefined
              ? []
              : [h.OnInput(value => messageFromToken(`${token}${value}`))]),
          ]
          return h.input(attrs)
        },
        Spacer: () => h.div([h.Class('fk-spacer')], []),
        Row: row => h.div([h.Class('fk-row')], Array.map(row.children, paint)),
        Column: column =>
          h.div([h.Class('fk-column')], Array.map(column.children, paint)),
        Box: box => h.div([h.Class('fk-box')], Array.map(box.children, paint)),
        DeviceShell: shell =>
          h.div(
            [h.Class(`fk-device fk-device-${shell.device}`)],
            Array.map(shell.children, paint),
          ),
      }),
    )
  return paint(node)
}

/** Screen, Action catalog, and token dispatch for a mobile Host. */
export type MobilePaintOptions<Model, Message> = Readonly<{
  screen: (model: Model, context?: Readonly<{ device?: Device }>) => UiNode
  actions: (
    model: Model,
    context?: Readonly<{ device?: Device }>,
  ) => ReadonlyArray<PadAction>
  toMessage: (token: string) => Message | undefined
  device?: Device
}>

const paintPadControl = <Message>(
  className: string,
  label: string,
  token: string,
  toMessage: (token: string) => Message | undefined,
): Html => {
  const h = html<Message>()
  const message = toMessage(token)
  const click = message === undefined ? [] : [h.OnClick(message)]
  return h.button([h.Type('button'), h.Class(className), ...click], [label])
}

/**
 * Paints a Program screen plus the pad derived from that tree.
 * Pad taps send the same tokens CLI argv and the TUI keymap send.
 */
export const paintMobile = <Message>(
  screen: UiNode,
  pad: MobilePad,
  toMessage: (token: string) => Message | undefined,
): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('fk-mobile')],
    [
      h.div([h.Class('fk-mobile-screen')], [paintHtml(screen, toMessage)]),
      h.div(
        [h.Class('fk-mobile-pad')],
        [
          h.div(
            [h.Class('fk-mobile-keys')],
            Array.map(pad.keys, key =>
              paintPadControl('fk-mobile-key', key.key, key.token, toMessage),
            ),
          ),
          h.div(
            [h.Class('fk-mobile-buttons')],
            Array.map(pad.buttons, button =>
              paintPadControl(
                'fk-mobile-button',
                button.label,
                button.token,
                toMessage,
              ),
            ),
          ),
        ],
      ),
    ],
  )
}

/**
 * Paints any Program.screen with phone chrome and a pad from that tree.
 * The Host supplies token dispatch. This is not a second product.
 */
export const paintMobileScreen = <Model, Message>(
  model: Model,
  options: MobilePaintOptions<Model, Message>,
): Html => {
  const device = options.device ?? 'phone'
  const context = { device }
  const screen = options.screen(model, context)
  return paintMobile(
    screen,
    padOf(screen, options.actions(model, context)),
    options.toMessage,
  )
}
