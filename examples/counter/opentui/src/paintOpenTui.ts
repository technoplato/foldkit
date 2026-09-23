import { Array, Match as M, Option } from 'effect'
import { Catalog, type Interaction } from 'foldkit'
import { type ButtonNode, type UiNode } from 'foldkit/renderers'

import {
  BoxRenderable,
  type RenderContext,
  type Renderable,
  TextRenderable,
  bold,
  dim,
  t,
} from '@opentui/core'

const buttonPaddingX = 1

/** How a painted OpenTUI tree finds key hints and reports presses. */
export type PaintOpenTuiOptions = Readonly<{
  keysOf: (action: string) => ReadonlyArray<string>
  onPress: (button: ButtonNode) => void
}>

/** How a painted action menu reports choices and dismissal. */
export type PaintOpenTuiMenuOptions = Readonly<{
  onChoose: (tag: string) => void
  onDismiss: () => void
}>

const buttonText = (
  button: ButtonNode,
  options: PaintOpenTuiOptions,
): string => {
  if (button.action === undefined) {
    return button.label
  }
  const hint = Option.getOrElse(
    Array.head(options.keysOf(button.action)),
    () => button.label,
  )
  const word = Catalog.commandOf(button.action)
  return button.because === undefined
    ? `[${hint}] ${word}`
    : `[${hint}] ${word} (${button.because})`
}

const addChildren = (
  ctx: RenderContext,
  parent: Renderable,
  children: ReadonlyArray<UiNode>,
  options: PaintOpenTuiOptions,
): Renderable => {
  Array.forEach(children, child => {
    parent.add(paintOpenTui(ctx, child, options))
  })
  return parent
}

/**
 * Maps a Program screen tree to an OpenTUI renderable tree. A Button
 * becomes a bordered box hinted with its Catalog key; a mouse press reports
 * the node so the Client presses its `action`. A disabled Button paints dim
 * with its sentence.
 */
export const paintOpenTui = (
  ctx: RenderContext,
  node: UiNode,
  options: PaintOpenTuiOptions,
): Renderable =>
  M.value(node).pipe(
    M.withReturnType<Renderable>(),
    M.tagsExhaustive({
      Text: text =>
        new TextRenderable(ctx, {
          content:
            text.dim === true
              ? t`${dim(text.content)}`
              : t`${bold(text.content)}`,
        }),
      Button: button => {
        const isPressable = button.disabled !== true
        const box = new BoxRenderable(ctx, {
          border: true,
          paddingLeft: buttonPaddingX,
          paddingRight: buttonPaddingX,
          ...(isPressable
            ? {
                onMouseDown: () => {
                  options.onPress(button)
                },
              }
            : {}),
        })
        const label = buttonText(button, options)
        box.add(
          new TextRenderable(ctx, {
            content: isPressable ? t`${bold(label)}` : t`${dim(label)}`,
          }),
        )
        return box
      },
      TextInput: input => new TextRenderable(ctx, { content: input.value }),
      Spacer: spacer => new BoxRenderable(ctx, { height: spacer.rows }),
      Row: row =>
        addChildren(
          ctx,
          new BoxRenderable(ctx, { flexDirection: 'row', columnGap: row.gap }),
          row.children,
          options,
        ),
      Column: column =>
        addChildren(
          ctx,
          new BoxRenderable(ctx, {
            flexDirection: 'column',
            rowGap: column.gap,
          }),
          column.children,
          options,
        ),
      Box: box =>
        addChildren(
          ctx,
          new BoxRenderable(ctx, {
            flexDirection: 'column',
            padding: box.padding,
          }),
          box.children,
          options,
        ),
      DeviceShell: shell =>
        addChildren(
          ctx,
          new BoxRenderable(ctx, {
            flexDirection: 'column',
            border: true,
            title: shell.title ?? shell.device,
          }),
          shell.children,
          options,
        ),
    }),
  )

const menuHint = '[type] filter  [↑↓] move  [enter] choose  [esc] close'

const rowMark = (row: Interaction.MenuRow): string =>
  row.isHighlighted ? '> ' : '  '

const paintMenu = (
  ctx: RenderContext,
  menu: Interaction.MenuView,
  options: PaintOpenTuiMenuOptions,
): Renderable => {
  const overlay = new BoxRenderable(ctx, {
    backgroundColor: '#0f172a',
    border: true,
    left: 2,
    padding: 1,
    position: 'absolute',
    title: 'Actions',
    top: 0,
    zIndex: 20,
  })
  overlay.add(new TextRenderable(ctx, { content: t`${dim(menuHint)}` }))
  overlay.add(
    new TextRenderable(ctx, {
      content: menu.isFilterFocused
        ? t`${bold(`filter: ${menu.query}_`)}`
        : t`${dim(`filter: ${menu.query}`)}`,
    }),
  )
  Array.forEach(menu.rows, row => {
    const isDisabled = row.entry.availability._tag === 'Disabled'
    const label = `${rowMark(row)}${Catalog.commandOf(row.entry.tag)}  ${row.entry.what}`
    const rowBox = new BoxRenderable(ctx, {
      ...(row.isFocused ? { backgroundColor: '#1d4ed8' } : {}),
      ...(isDisabled
        ? {}
        : {
            onMouseDown: () => {
              options.onChoose(row.entry.tag)
            },
          }),
    })
    rowBox.add(
      new TextRenderable(ctx, {
        content: isDisabled ? t`${dim(label)}` : t`${bold(label)}`,
      }),
    )
    overlay.add(rowBox)
  })
  const close = new BoxRenderable(ctx, {
    onMouseDown: () => {
      options.onDismiss()
    },
  })
  close.add(new TextRenderable(ctx, { content: t`${dim('[esc] Close')}` }))
  overlay.add(close)
  return overlay
}

/**
 * Paints the screen tree, then floats the presented action menu over it.
 * Menu rows come from the generic MenuView; they are not screen Buttons.
 */
export const paintOpenTuiFrame = (
  ctx: RenderContext,
  maybeScreen: Option.Option<UiNode>,
  maybeMenu: Option.Option<Interaction.MenuView>,
  options: PaintOpenTuiOptions & PaintOpenTuiMenuOptions,
): Renderable => {
  const frame = new BoxRenderable(ctx, {
    flexDirection: 'column',
    flexGrow: 1,
    position: 'relative',
  })
  if (Option.isSome(maybeScreen)) {
    frame.add(paintOpenTui(ctx, maybeScreen.value, options))
  }
  if (Option.isSome(maybeMenu)) {
    frame.add(paintMenu(ctx, maybeMenu.value, options))
  }
  return frame
}
