import { Array, Match as M, Option } from 'effect'

import { type Html, html } from '../html/index.js'
import type { MenuView } from '../interaction/interaction.js'
import type { Device } from './device.js'
import { type MobilePad, type PadAction, padOf } from './pad.js'
import type { UiNode } from './types.js'

/**
 * Paints a Program screen tree as Foldkit HTML. A Button's Catalog `action`,
 * or its legacy `token`, becomes a click through `toMessage`.
 */
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
          const key = button.action ?? button.token
          const message = key === undefined ? undefined : toMessage(key)
          const click =
            message !== undefined && button.disabled !== true
              ? [h.OnClick(message)]
              : []
          const disabled = button.disabled === true ? [h.Disabled(true)] : []
          const because =
            button.because === undefined ? [] : [h.Title(button.because)]
          return h.button(
            [
              h.Type('button'),
              h.Class('fk-button'),
              ...click,
              ...disabled,
              ...because,
            ],
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

const menuRowIdOf = (tag: string): string => `fk-action-menu-${tag}`

const menuListId = 'fk-action-menu-list'

/** The Messages a painted action menu reports. */
export type MenuMessages<Message> = Readonly<{
  typed: (query: string) => Message
  chose: (tag: string) => Message
  dismissed: () => Message
}>

/**
 * Paints a presented action menu as Foldkit HTML: a backdrop, a combo box
 * filter, and a listbox of Catalog rows. Keys are routed separately by
 * `Interaction.listenToDocumentKeys`; the filter only carries typing.
 *
 * @example
 * ```typescript
 * Option.match(interaction.menu(model), {
 *   onNone: () => [],
 *   onSome: menu => [paintMenuHtml(menu, gestureMessages)],
 * })
 * ```
 */
export const paintMenuHtml = <Message>(
  menu: MenuView,
  messages: MenuMessages<Message>,
): Html => {
  const h = html<Message>()
  const activeDescendant = Option.match(
    Array.findFirst(menu.rows, row => row.isHighlighted),
    {
      onNone: () => [],
      onSome: row => [h.AriaActiveDescendant(menuRowIdOf(row.entry.tag))],
    },
  )
  const rows = Array.map(menu.rows, row =>
    h.li(
      [
        h.Id(menuRowIdOf(row.entry.tag)),
        h.Role('option'),
        h.Class('fk-action-menu-row'),
        h.AriaSelected(row.isHighlighted),
        h.AriaDisabled(row.entry.availability._tag === 'Disabled'),
        h.DataAttribute('focused', row.isFocused ? 'true' : 'false'),
        h.OnClick(messages.chose(row.entry.tag)),
      ],
      [
        h.span([h.Class('fk-action-menu-label')], [row.entry.label]),
        h.span([h.Class('fk-action-menu-what')], [row.entry.what]),
        ...M.value(row.entry.availability).pipe(
          M.withReturnType<ReadonlyArray<Html>>(),
          M.tagsExhaustive({
            Enabled: () => [],
            Disabled: ({ because }) => [
              h.span([h.Class('fk-action-menu-because')], [because]),
            ],
          }),
        ),
      ],
    ),
  )
  return h.div(
    [h.Class('fk-action-menu-layer')],
    [
      h.div(
        [h.Class('fk-action-menu-backdrop'), h.OnClick(messages.dismissed())],
        [],
      ),
      h.div(
        [
          h.Role('dialog'),
          h.AriaModal(true),
          h.AriaLabelledBy('fk-action-menu-title'),
          h.Class('fk-action-menu'),
          h.DataAttribute('style', menu.style._tag),
        ],
        [
          h.h2(
            [h.Id('fk-action-menu-title'), h.Class('fk-action-menu-title')],
            ['Actions'],
          ),
          h.input([
            h.Role('combobox'),
            h.AriaExpanded(true),
            h.AriaControls(menuListId),
            h.AriaLabel('Filter actions'),
            h.Class('fk-action-menu-filter'),
            h.Value(menu.query),
            h.Readonly(!menu.isFilterFocused),
            h.Autofocus(true),
            h.OnInput(messages.typed),
            ...activeDescendant,
          ]),
          h.ul(
            [
              h.Id(menuListId),
              h.Role('listbox'),
              h.Class('fk-action-menu-rows'),
            ],
            rows,
          ),
          ...Array.match(menu.rows, {
            onEmpty: () => [
              h.p([h.Class('fk-action-menu-empty')], ['No matching actions']),
            ],
            onNonEmpty: () => [],
          }),
        ],
      ),
    ],
  )
}
