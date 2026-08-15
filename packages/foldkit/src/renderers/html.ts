import { Array, Match as M } from 'effect'

import { type Html, html } from '../html/index.js'
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
        Text: text => h.div([h.Class('fk-text')], [text.content]),
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
        TextInput: input => h.div([h.Class('fk-text-input')], [input.value]),
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
